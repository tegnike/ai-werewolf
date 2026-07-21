import { randomBytes, randomUUID } from 'node:crypto';
import type {
  DecisionContext, DecisionProvider, GeminiThinkingBudget, LlmProvider, MatchEvent, MatchRecord, OpenAiReasoningEffort,
  RunHooks, SpeechDecision, SpeechIntentDecision, TargetDecision, TtsProvider,
} from '@/domain/types';
import type { CharacterRoster } from '@/domain/characters';
import { runGame } from '@/engine/game';
import { assignCharacterSeats } from '@/engine/character-seating';
import { MockAI } from './ai/mock';
import { AIRequestError, ApiBudgetError, RealAI } from './ai/client';
import {
  configuredLlmProvider, DEFAULT_GEMINI_THINKING_BUDGET, DEFAULT_OPENAI_REASONING_EFFORT, hasApiKey,
  isGeminiThinkingBudget, isOpenAiReasoningEffort, modelForProvider,
} from './ai/provider';
import { publishEvent } from './bus';
import { logger } from './log';
import { MatchRepo } from './repo';

class AbortMatchError extends Error {}
class RecoveryDivergenceError extends Error {}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function runnerError(error: unknown, model: string): NonNullable<MatchRecord['error']> {
  const message = error instanceof Error ? error.message : 'Runner failed';
  if (/(?:OPENAI|GEMINI)_API_KEY|ALLOW_REAL_AI/.test(message)) {
    return { code: 'real_ai_configuration', message: '実AIの起動条件が不足しています。サーバー設定を確認してください。', model };
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
  private readonly legacyLlmProvider: LlmProvider;
  private readonly legacyLlmModel: string;
  private readonly legacyOpenaiReasoningEffort: OpenAiReasoningEffort;
  private readonly legacyGeminiThinkingBudget: GeminiThinkingBudget;
  private readonly realAiBySeat = new Map<string, RealAI>();
  private cursor = 0;
  private seq = 0;

  constructor(private readonly matchId: string, private readonly repo: MatchRepo) {
    this.existing = repo.events(matchId);
    const match = repo.getMatch(matchId);
    this.legacyLlmProvider = match?.config.llmProvider ?? 'openai';
    this.legacyLlmModel = match?.config.llmModel ?? modelForProvider(this.legacyLlmProvider);
    this.legacyOpenaiReasoningEffort = match?.config.openaiReasoningEffort ?? DEFAULT_OPENAI_REASONING_EFFORT;
    this.legacyGeminiThinkingBudget = match?.config.geminiThinkingBudget ?? DEFAULT_GEMINI_THINKING_BUDGET;
  }

  private decisionSettings(context: DecisionContext): {
    provider: LlmProvider; model: string; openaiReasoningEffort: OpenAiReasoningEffort; geminiThinkingBudget: GeminiThinkingBudget;
  } {
    const match = this.repo.getMatch(this.matchId);
    const character = match?.config.characters?.find((item) => item.seat === context.actor.seat);
    const provider = character?.llm.provider ?? this.legacyLlmProvider;
    return {
      provider,
      model: match?.config.characterLlmModels?.[context.actor.seat]
        ?? (provider === this.legacyLlmProvider ? this.legacyLlmModel : modelForProvider(provider)),
      openaiReasoningEffort: character?.llm.provider === 'openai'
        ? character.llm.reasoningEffort
        : this.legacyOpenaiReasoningEffort,
      geminiThinkingBudget: character?.llm.provider === 'gemini'
        ? character.llm.thinkingBudget
        : this.legacyGeminiThinkingBudget,
    };
  }

  private realAi(context: DecisionContext): RealAI {
    const settings = this.decisionSettings(context);
    const key = `${context.actor.seat}:${settings.provider}:${settings.model}:${settings.openaiReasoningEffort}:${settings.geminiThinkingBudget}`;
    let client = this.realAiBySeat.get(key);
    if (!client) {
      client = new RealAI(
        this.repo, settings.provider, settings.model, settings.openaiReasoningEffort, settings.geminiThinkingBudget,
      );
      this.realAiBySeat.set(key, client);
    }
    return client;
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
        const settings = this.decisionSettings(context);
        this.repo.updateStatus(this.matchId, 'paused_error', null, {
          code: error instanceof AIRequestError ? error.code : ('code' in (error as object) ? String((error as { code: unknown }).code) : 'ai_error'),
          message,
          phase: context.phase,
          model: settings.model,
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
      const mockAi = new MockAI();
      const baseFor = (context: DecisionContext): DecisionProvider => match.config.ai === 'real' ? this.realAi(context) : mockAi;
      const ai: DecisionProvider = {
        speech: (context): Promise<SpeechDecision> => this.controlledDecision(() => baseFor(context).speech(context), context),
        speechIntent: (context): Promise<SpeechIntentDecision> => this.controlledDecision(() => baseFor(context).speechIntent(context), context),
        target: (context): Promise<TargetDecision> => this.controlledDecision(() => baseFor(context).target(context), context),
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
      const rules = created?.payload.rules as { claims?: unknown; discussion?: unknown; nightZero?: unknown } | undefined;
      const claimsVersion = this.existing.length === 0
        ? 'v2'
        : rules?.claims === 'v2'
          ? 'v2'
          : rules?.claims === 'v1'
            ? 'v1'
            : undefined;
      const discussionVersion = this.existing.length === 0
        ? 'v3'
        : rules?.discussion === 'v3'
          ? 'v3'
          : rules?.discussion === 'v2'
            ? 'v2'
            : 'legacy';
      const nightZeroMode = this.existing.length === 0 || rules?.nightZero === 'uniform' ? 'uniform' : 'ai';
      const result = await runGame(this.matchId, match.seed, ai, hooks, {
        includeDayOneDawn, claimsVersion, discussionVersion, nightZeroMode, characters: match.config.characters,
      });
      this.repo.updateStatus(this.matchId, 'finished', result.winner);
    } catch (error) {
      if (error instanceof AbortMatchError) {
        this.repo.updateStatus(this.matchId, 'aborted');
      } else if (error instanceof ApiBudgetError) {
        this.repo.updateStatus(this.matchId, 'aborted_budget', null, { code: error.code, message: error.message });
      } else {
        this.repo.updateStatus(this.matchId, 'paused_error', null, runnerError(error, 'character-specific'));
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

  create(input: {
    seed?: string;
    speed?: number;
    ai?: 'mock' | 'real';
    llmProvider?: LlmProvider;
    openaiReasoningEffort?: OpenAiReasoningEffort;
    geminiThinkingBudget?: GeminiThinkingBudget;
    ttsProvider?: TtsProvider;
  }): MatchRecord {
    const active = this.repo.listMatches().filter((match) => match.status === 'running' || match.status === 'paused' || match.status === 'paused_error').length;
    if (active >= 2) throw new Error('MATCH_LIMIT_REACHED');
    const ai = input.ai ?? 'mock';
    const llmProvider = input.llmProvider ?? configuredLlmProvider();
    const llmModel = modelForProvider(llmProvider);
    const openaiReasoningEffort = input.openaiReasoningEffort ?? DEFAULT_OPENAI_REASONING_EFFORT;
    const geminiThinkingBudget = input.geminiThinkingBudget ?? DEFAULT_GEMINI_THINKING_BUDGET;
    const ttsProvider = input.ttsProvider ?? (process.env.TTS_PROVIDER === 'aivisspeech' ? 'aivisspeech' : 'voicevox');
    if (!isOpenAiReasoningEffort(openaiReasoningEffort) || !isGeminiThinkingBudget(geminiThinkingBudget)) {
      throw new Error('INVALID_REASONING_CONFIG');
    }
    const now = new Date().toISOString();
    const seed = input.seed?.trim() || randomBytes(8).toString('hex');
    let characters: CharacterRoster = assignCharacterSeats(this.repo.characterRoster(), seed);
    const hasRuntimeOverride = input.llmProvider !== undefined || input.openaiReasoningEffort !== undefined
      || input.geminiThinkingBudget !== undefined || input.ttsProvider !== undefined;
    if (hasRuntimeOverride) {
      characters = characters.map((character) => {
        const provider = input.llmProvider ?? character.llm.provider;
        const llm = provider === 'openai'
          ? {
            provider,
            reasoningEffort: input.openaiReasoningEffort
              ?? (character.llm.provider === 'openai' ? character.llm.reasoningEffort : DEFAULT_OPENAI_REASONING_EFFORT),
          } as const
          : {
            provider,
            thinkingBudget: input.geminiThinkingBudget
              ?? (character.llm.provider === 'gemini' ? character.llm.thinkingBudget : DEFAULT_GEMINI_THINKING_BUDGET),
          } as const;
        return {
          ...character,
          llm,
          ...(input.ttsProvider === undefined
            ? {}
            : { tts: { provider: ttsProvider, voice: character.tts.voice } as CharacterRoster[number]['tts'] }),
        };
      });
    }
    const requiredLlmProviders = new Set(characters.map((character) => character.llm.provider));
    if (ai === 'real' && process.env.ALLOW_REAL_AI !== '1') throw new Error('REAL_AI_NOT_ALLOWED');
    if (ai === 'real' && [...requiredLlmProviders].some((provider) => !hasApiKey(provider))) throw new Error('REAL_AI_NOT_CONFIGURED');
    const characterLlmModels = Object.fromEntries(
      characters.map((character) => [character.seat, modelForProvider(character.llm.provider)]),
    );
    const record: MatchRecord = {
      id: randomUUID(), seed, status: 'running', winner: null,
      speed: input.speed ?? 1500, apiCalls: 0, error: null,
      config: {
        ai,
        ...(hasRuntimeOverride ? { llmProvider, llmModel, openaiReasoningEffort, geminiThinkingBudget, ttsProvider } : {}),
        characterLlmModels,
        characters,
      },
      createdAt: now, updatedAt: now, finishedAt: null,
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
