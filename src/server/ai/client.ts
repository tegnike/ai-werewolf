import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { createHash } from 'node:crypto';
import { MODEL } from '@/domain/constants';
import type { DecisionContext, DecisionProvider, SpeechDecision, TargetDecision } from '@/domain/types';
import type { MatchRepo } from '@/server/repo';
import { buildPrompts } from './prompts';
import { SpeechDecisionSchema, targetDecisionSchema } from './schemas';
import { validateSpeechDisclosure } from './disclosure';

export class AmbiguousAICallError extends Error { code = 'ambiguous_ai_call'; }
export class ApiBudgetError extends Error { code = 'aborted_budget'; }
export class AIRequestError extends Error {
  code = 'ai_request_failed';
  constructor(message: string, public readonly phase: string) { super(message); }
}

const retryableStatus = new Set([408, 409, 429, 500, 502, 503, 504]);
const delays = [1_000, 2_000, 4_000, 8_000, 16_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parsedOutput<T>(response: OpenAI.Responses.Response): T {
  for (const output of response.output) {
    if (output.type !== 'message') continue;
    for (const item of output.content) {
      if (item.type === 'refusal') throw new Error('Model refusal');
      if (item.type === 'output_text' && 'parsed' in item && item.parsed) return item.parsed as T;
    }
  }
  throw new Error('Structured output was not parsed');
}

export class RealAI implements DecisionProvider {
  private readonly client: OpenAI;
  constructor(private readonly repo: MatchRepo) {
    if (process.env.ALLOW_REAL_AI !== '1') throw new Error('Real AI requires ALLOW_REAL_AI=1');
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 60_000 });
  }

  speech(context: DecisionContext): Promise<SpeechDecision> {
    return this.request(context, SpeechDecisionSchema, 'speech_decision', (decision) => validateSpeechDisclosure(context, decision));
  }
  target(context: DecisionContext): Promise<TargetDecision> {
    return this.request(context, targetDecisionSchema(context.legalTargets), 'target_decision');
  }

  private async request<T>(context: DecisionContext, schema: Parameters<typeof zodTextFormat>[0], schemaName: string, validate?: (decision: T) => void): Promise<T> {
    const cached = this.repo.getAiCall(context.matchId, context.callKey);
    if (cached?.status === 'ok') return cached.response as T;
    if (cached?.status === 'in_flight') throw new AmbiguousAICallError('前回のAPI呼び出し結果が不明です。明示的な再試行が必要です。');
    const { systemPrompt, decisionPrompt } = buildPrompts(context);
    const requestHash = createHash('sha256').update(`${MODEL}\n${systemPrompt}\n${decisionPrompt}`).digest('hex');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await sleep(delays[attempt - 1]);
      try {
        this.repo.beginAiAttempt(context.matchId, context.callKey, requestHash);
      } catch (error) {
        if (error instanceof Error && error.message === 'API_BUDGET_EXCEEDED') throw new ApiBudgetError('API呼び出し上限へ到達しました。');
        throw error;
      }
      let requestId: string | null = null;
      try {
        const response = await this.client.responses.parse({
          model: MODEL,
          reasoning: { effort: 'low' },
          input: [{ role: 'system', content: systemPrompt }, { role: 'user', content: decisionPrompt }],
          text: { format: zodTextFormat(schema, schemaName) },
        });
        requestId = response.id;
        const parsed = parsedOutput<T>(response);
        validate?.(parsed);
        this.repo.completeAiCall(context.matchId, context.callKey, parsed, requestId);
        return parsed;
      } catch (error) {
        const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
        this.repo.failAiCall(context.matchId, context.callKey, requestId);
        const retryable = status === 0 || retryableStatus.has(status) || /refusal|parse|timeout|connection/i.test(String(error));
        if (!retryable || attempt === 4) throw new AIRequestError('AI判断を取得できませんでした。', context.phase);
      }
    }
    throw new AIRequestError('AI判断を取得できませんでした。', context.phase);
  }
}
