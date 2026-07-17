import { randomBytes, randomUUID } from 'node:crypto';
import type {
  DecisionContext, DecisionProvider, MatchEvent, MatchRecord, RunHooks, SpeechDecision, SpeechIntentDecision, TargetDecision,
} from '@/domain/types';
import { runGame } from '@/engine/game';
import { MockAI } from './ai/mock';
import { AIRequestError, ApiBudgetError, RealAI } from './ai/client';
import { publishEvent } from './bus';
import { logger } from './log';
import { MatchRepo } from './repo';

class AbortMatchError extends Error {}
class RecoveryDivergenceError extends Error {}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function runnerError(error: unknown): NonNullable<MatchRecord['error']> {
  const message = error instanceof Error ? error.message : 'Runner failed';
  if (/OPENAI_API_KEY|ALLOW_REAL_AI/.test(message)) {
    return { code: 'real_ai_configuration', message: '実AIの起動条件が不足しています。サーバー設定を確認してください。', model: 'gpt-5.6-luna' };
  }
  return { code: 'runner_error', message };
}

function sameDraft(existing: MatchEvent, draft: Omit<MatchEvent, 'matchId' | 'seq' | 'createdAt'>): boolean {
  return existing.day === draft.day && existing.phase === draft.phase && existing.type === draft.type &&
    existing.visibility === draft.visibility && JSON.stringify(existing.audienceSeats) === JSON.stringify(draft.audienceSeats) &&
    JSON.stringify(existing.payload) === JSON.stringify(draft.payload);
}

export class MatchRunner {
  private paused = false;
  private aborted = false;
  private retryRequested = false;
  private running = false;
  private readonly existing: MatchEvent[];
  private cursor = 0;
  private seq = 0;

  constructor(private readonly matchId: string, private readonly repo: MatchRepo) {
    this.existing = repo.events(matchId);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.run();
  }

  isRunning(): boolean {
    return this.running;
  }

  control(action: 'pause' | 'resume' | 'abort' | 'retry', speed?: number): void {
    if (typeof speed === 'number') this.repo.updateSpeed(this.matchId, speed);
    if (action === 'pause') { this.paused = true; this.repo.updateStatus(this.matchId, 'paused'); }
    if (action === 'resume') { this.paused = false; this.repo.updateStatus(this.matchId, 'running'); }
    if (action === 'abort') { this.aborted = true; this.paused = false; this.retryRequested = true; }
    if (action === 'retry') { this.retryRequested = true; this.paused = false; }
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.aborted) await wait(100);
    if (this.aborted) throw new AbortMatchError('Match aborted');
  }

  private async controlledDecision<T>(perform: () => Promise<T>, context: DecisionContext): Promise<T> {
    while (true) {
      try {
        const result = await perform();
        await this.waitWhilePaused();
        return result;
      } catch (error) {
        if (error instanceof AbortMatchError || error instanceof ApiBudgetError) throw error;
        const message = error instanceof Error ? error.message : 'AI判断に失敗しました。';
        this.repo.updateStatus(this.matchId, 'paused_error', null, {
          code: error instanceof AIRequestError ? error.code : ('code' in (error as object) ? String((error as { code: unknown }).code) : 'ai_error'),
          message,
          phase: context.phase,
          model: 'gpt-5.6-luna',
          ...(error instanceof AIRequestError ? { reason: error.reason } : {}),
        });
        this.retryRequested = false;
        while (!this.retryRequested && !this.aborted) await wait(100);
        if (this.aborted) throw new AbortMatchError('Match aborted');
        this.retryRequested = false;
        this.repo.updateStatus(this.matchId, 'running');
      }
    }
  }

  private async run(): Promise<void> {
    try {
      const match = this.repo.getMatch(this.matchId);
      if (!match) return;
      const base: DecisionProvider = match.config.ai === 'real' ? new RealAI(this.repo) : new MockAI();
      const ai: DecisionProvider = {
        speech: (context): Promise<SpeechDecision> => this.controlledDecision(() => base.speech(context), context),
        speechIntent: (context): Promise<SpeechIntentDecision> => this.controlledDecision(() => base.speechIntent(context), context),
        target: (context): Promise<TargetDecision> => this.controlledDecision(() => base.target(context), context),
      };
      const hooks: RunHooks = {
        emit: async (draft) => {
          const recovered = this.existing[this.cursor];
          if (recovered) {
            if (!sameDraft(recovered, draft)) throw new RecoveryDivergenceError(`Event ${recovered.seq} diverged during recovery`);
            this.cursor += 1;
            this.seq = recovered.seq;
            return;
          }
          const event: MatchEvent = { ...draft, matchId: this.matchId, seq: ++this.seq, createdAt: new Date().toISOString() };
          this.repo.appendEvent(event);
          publishEvent(event);
        },
        checkpoint: async () => {
          await this.waitWhilePaused();
          if (this.cursor < this.existing.length) return;
          const current = this.repo.getMatch(this.matchId);
          if (current?.speed) await wait(current.speed);
          await this.waitWhilePaused();
        },
      };

      this.repo.updateStatus(this.matchId, 'running');
      const includeDayOneDawn = this.existing.some((event) => event.day === 1 && event.type === 'dawn');
      const created = this.existing.find((event) => event.type === 'match_created');
      const rules = created?.payload.rules as { claims?: unknown; discussion?: unknown } | undefined;
      const claimsVersion = this.existing.length === 0 || rules?.claims === 'v1' ? 'v1' : undefined;
      const discussionVersion = this.existing.length === 0
        ? 'v3'
        : rules?.discussion === 'v3'
          ? 'v3'
          : rules?.discussion === 'v2'
            ? 'v2'
            : 'legacy';
      const result = await runGame(this.matchId, match.seed, ai, hooks, { includeDayOneDawn, claimsVersion, discussionVersion });
      this.repo.updateStatus(this.matchId, 'finished', result.winner);
    } catch (error) {
      if (error instanceof AbortMatchError) {
        this.repo.updateStatus(this.matchId, 'aborted');
      } else if (error instanceof ApiBudgetError) {
        this.repo.updateStatus(this.matchId, 'aborted_budget', null, { code: error.code, message: error.message });
      } else {
        this.repo.updateStatus(this.matchId, 'paused_error', null, runnerError(error));
        logger.error({ matchId: this.matchId, status: 'paused_error' }, 'match runner stopped');
      }
    } finally {
      this.running = false;
    }
  }
}

export class MatchRunnerManager {
  private readonly runners = new Map<string, MatchRunner>();
  constructor(readonly repo = new MatchRepo()) {}

  create(input: { seed?: string; speed?: number; ai?: 'mock' | 'real' }): MatchRecord {
    const active = this.repo.listMatches().filter((match) => match.status === 'running' || match.status === 'paused' || match.status === 'paused_error').length;
    if (active >= 2) throw new Error('MATCH_LIMIT_REACHED');
    const ai = input.ai ?? 'mock';
    if (ai === 'real' && process.env.ALLOW_REAL_AI !== '1') throw new Error('REAL_AI_NOT_ALLOWED');
    if (ai === 'real' && !process.env.OPENAI_API_KEY) throw new Error('REAL_AI_NOT_CONFIGURED');
    const now = new Date().toISOString();
    const record: MatchRecord = {
      id: randomUUID(), seed: input.seed?.trim() || randomBytes(8).toString('hex'), status: 'running', winner: null,
      speed: input.speed ?? 1500, apiCalls: 0, error: null, config: { ai }, createdAt: now, updatedAt: now, finishedAt: null,
    };
    this.repo.createMatch(record);
    this.start(record.id);
    return record;
  }

  start(matchId: string): void {
    let runner = this.runners.get(matchId);
    if (!runner || !runner.isRunning()) {
      runner = new MatchRunner(matchId, this.repo);
      this.runners.set(matchId, runner);
    }
    runner.start();
  }

  control(matchId: string, action: 'pause' | 'resume' | 'abort' | 'retry', speed?: number): void {
    const match = this.repo.getMatch(matchId);
    if (!match) throw new Error('MATCH_NOT_FOUND');
    let runner = this.runners.get(matchId);
    if ((!runner || !runner.isRunning()) && (action === 'resume' || action === 'retry')) {
      runner = new MatchRunner(matchId, this.repo);
      this.runners.set(matchId, runner);
      runner.control(action, speed);
      runner.start();
      return;
    }
    runner?.control(action, speed);
  }

  recover(): void {
    for (const match of this.repo.listMatches().filter((item) => item.status === 'running')) this.start(match.id);
  }
}

const globalManager = globalThis as typeof globalThis & { __werewolfManager?: MatchRunnerManager };
export function getRunnerManager(): MatchRunnerManager {
  globalManager.__werewolfManager ??= new MatchRunnerManager();
  return globalManager.__werewolfManager;
}
