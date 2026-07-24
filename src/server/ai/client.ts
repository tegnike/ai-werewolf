import OpenAI from 'openai';
import { ThinkingLevel } from '@google/genai';
import type { GoogleGenAI, ThinkingConfig } from '@google/genai';
import { zodTextFormat } from 'openai/helpers/zod';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ClaimContractError } from '@/domain/claims';
import type {
  DecisionContext, DecisionProvider, GeminiThinkingBudget, GeminiThinkingLevel, LlmProvider, OpenAiReasoningEffort,
  SpeechDecision, SpeechIntentDecision, TargetDecision,
} from '@/domain/types';
import type { MatchRepo } from '@/server/repo';
import { buildPrompts } from './prompts';
import {
  apiKeyForProvider, defaultGeminiThinkingLevel, DEFAULT_GEMINI_THINKING_BUDGET,
  DEFAULT_OPENAI_REASONING_EFFORT, modelForProvider,
} from './provider';
import { speechDecisionSchema, speechIntentDecisionSchema, targetDecisionSchema } from './schemas';
import { validateSpeechDisclosure } from './disclosure';
import { logger } from '../log';

export class AmbiguousAICallError extends Error { code = 'ambiguous_ai_call'; }
export class ApiBudgetError extends Error { code = 'aborted_budget'; }
export class AIRequestError extends Error {
  code = 'ai_request_failed';
  constructor(message: string, public readonly phase: string, public readonly reason: string) { super(message); }
}

const retryableStatus = new Set([408, 409, 429, 500, 502, 503, 504]);
const delays = [1_000, 2_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const MAX_AI_ATTEMPTS = 3;

export function openAiReasoningConfig(effort: OpenAiReasoningEffort): { effort: OpenAiReasoningEffort } {
  return { effort };
}

export function geminiThinkingConfig(
  model: string,
  thinkingBudget: GeminiThinkingBudget,
  thinkingLevel: GeminiThinkingLevel,
): ThinkingConfig {
  const levels = {
    minimal: ThinkingLevel.MINIMAL,
    low: ThinkingLevel.LOW,
    medium: ThinkingLevel.MEDIUM,
    high: ThinkingLevel.HIGH,
  } as const;
  return model === 'gemini-3.6-flash' || model === 'gemini-3.5-flash-lite'
    ? { thinkingLevel: levels[thinkingLevel] }
    : { thinkingBudget };
}

export type AIRetryClass = 'contract' | 'structured_output' | 'transport' | 'non_retryable';

export function aiRetryPolicy(error: unknown): { kind: AIRetryClass; retryable: boolean } {
  if (error instanceof ClaimContractError) return { kind: 'contract', retryable: true };
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
  const description = String(error);
  if ((status >= 200 && status < 300) || /refusal|parse|validation|zod|structured output/i.test(description)) {
    return { kind: 'structured_output', retryable: true };
  }
  if (status === 0 || retryableStatus.has(status) || /timeout|connection/i.test(description)) {
    return { kind: 'transport', retryable: true };
  }
  return { kind: 'non_retryable', retryable: false };
}

function safeToken(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_.\[\]-]{1,80}$/.test(value) ? value : null;
}

export function safeAIRequestReason(error: unknown): string {
  if (error instanceof ClaimContractError) {
    const rule = safeToken(error.rule);
    return rule ? `claim_contract:${rule}` : 'claim_contract';
  }
  if (!error || typeof error !== 'object') return 'request_error';
  const candidate = error as { status?: unknown; code?: unknown; type?: unknown; param?: unknown };
  const status = Number(candidate.status);
  if ((status >= 200 && status < 300) || /refusal|parse|validation|zod|structured output/i.test(String(error))) {
    return 'structured_output';
  }
  const parts = [
    Number.isInteger(status) && status >= 400 && status <= 599 ? `http_${status}` : null,
    safeToken(candidate.code),
    safeToken(candidate.type),
    safeToken(candidate.param),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(':') : 'request_error';
}

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
  private readonly openai: OpenAI | null;
  private gemini: GoogleGenAI | null;
  private readonly apiKey: string;
  private readonly geminiThinkingLevel: GeminiThinkingLevel;
  readonly model: string;

  constructor(
    private readonly repo: MatchRepo,
    readonly provider: LlmProvider = 'openai',
    model?: string,
    private readonly openaiReasoningEffort: OpenAiReasoningEffort = DEFAULT_OPENAI_REASONING_EFFORT,
    private readonly geminiThinkingBudget: GeminiThinkingBudget = DEFAULT_GEMINI_THINKING_BUDGET,
    geminiThinkingLevel?: GeminiThinkingLevel,
  ) {
    if (process.env.ALLOW_REAL_AI !== '1') throw new Error('Real AI requires ALLOW_REAL_AI=1');
    const apiKey = apiKeyForProvider(provider);
    if (!apiKey) throw new Error(`${provider === 'gemini' ? 'GEMINI' : 'OPENAI'}_API_KEY is required`);
    this.apiKey = apiKey;
    this.model = model?.trim() || modelForProvider(provider);
    this.geminiThinkingLevel = geminiThinkingLevel ?? defaultGeminiThinkingLevel(this.model);
    this.openai = provider === 'openai' ? new OpenAI({ apiKey, maxRetries: 0, timeout: 60_000 }) : null;
    this.gemini = null;
  }

  speech(context: DecisionContext): Promise<SpeechDecision> {
    return this.request(
      context,
      speechDecisionSchema(
        context.legalTargets,
        Boolean(context.claimDirective),
        context.kind !== 'wolf_speech' && context.discussion?.canRequestReply !== false,
        context.discussion?.version === 'v3'
          ? context.players.filter((player) => player.alive && player.seat !== context.actor.seat).map((player) => player.seat)
          : undefined,
        context.claimDirective?.strategicChoice === true,
        Boolean(context.claimDirective?.personalityContext),
      ),
      'speech_decision',
      (decision) => validateSpeechDisclosure(context, decision),
    );
  }
  speechIntent(context: DecisionContext): Promise<SpeechIntentDecision> {
    return this.request(context, speechIntentDecisionSchema(context.legalTargets), 'speech_intent_decision');
  }
  target(context: DecisionContext): Promise<TargetDecision> {
    return this.request(context, targetDecisionSchema(context.legalTargets), 'target_decision');
  }

  private async generate<T>(
    systemPrompt: string,
    decisionPrompt: string,
    schema: z.ZodType<T>,
    schemaName: string,
  ): Promise<{ parsed: T; requestId: string | null }> {
    if (this.provider === 'gemini') {
      if (!this.gemini) {
        const { GoogleGenAI } = await import('@google/genai');
        this.gemini = new GoogleGenAI({
          apiKey: this.apiKey,
          httpOptions: { timeout: 60_000, retryOptions: { attempts: 1 } },
        });
      }
      const response = await this.gemini.models.generateContent({
        model: this.model,
        contents: decisionPrompt,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: geminiThinkingConfig(
            this.model,
            this.geminiThinkingBudget,
            this.geminiThinkingLevel,
          ),
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(schema),
        },
      });
      if (!response.text) throw new Error('Structured output was not parsed');
      return { parsed: schema.parse(JSON.parse(response.text)), requestId: response.responseId ?? null };
    }
    if (!this.openai) throw new Error('OpenAI client is not configured');
    const response = await this.openai.responses.parse({
      model: this.model,
      reasoning: openAiReasoningConfig(this.openaiReasoningEffort),
      input: [{ role: 'system', content: systemPrompt }, { role: 'user', content: decisionPrompt }],
      text: { format: zodTextFormat(schema, schemaName) },
    });
    return { parsed: parsedOutput<T>(response), requestId: response.id };
  }

  private async request<T>(context: DecisionContext, schema: z.ZodType<T>, schemaName: string, validate?: (decision: T) => void): Promise<T> {
    const cached = this.repo.getAiCall(context.matchId, context.callKey);
    if (cached?.status === 'ok') return cached.response as T;
    if (cached?.status === 'in_flight') throw new AmbiguousAICallError('前回のAPI呼び出し結果が不明です。明示的な再試行が必要です。');
    const { systemPrompt, decisionPrompt } = buildPrompts(context);
    let repairInstruction = '';
    const repairInstructions: string[] = [];

    for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(delays[attempt - 1]);
      const currentDecisionPrompt = repairInstruction
        ? `${decisionPrompt}\n修正指示: ${repairInstruction}`
        : decisionPrompt;
      const requestHash = createHash('sha256')
        .update(`${this.provider}\n${this.model}\n${this.openaiReasoningEffort}\n${this.geminiThinkingBudget}\n${this.geminiThinkingLevel}\n${systemPrompt}\n${currentDecisionPrompt}`)
        .digest('hex');
      try {
        this.repo.beginAiAttempt(context.matchId, context.callKey, requestHash);
      } catch (error) {
        if (error instanceof Error && error.message === 'API_BUDGET_EXCEEDED') throw new ApiBudgetError('API呼び出し上限へ到達しました。');
        throw error;
      }
      let requestId: string | null = null;
      try {
        const generated = await this.generate(systemPrompt, currentDecisionPrompt, schema, schemaName);
        requestId = generated.requestId;
        const parsed = generated.parsed;
        validate?.(parsed);
        this.repo.completeAiCall(context.matchId, context.callKey, parsed, requestId);
        return parsed;
      } catch (error) {
        if (error instanceof ClaimContractError && !repairInstructions.includes(error.repairHint)) {
          repairInstructions.push(error.repairHint);
          repairInstruction = repairInstructions.join(' ');
        }
        if (!requestId && typeof error === 'object' && error && 'request_id' in error && typeof error.request_id === 'string') {
          requestId = error.request_id;
        }
        this.repo.failAiCall(context.matchId, context.callKey, requestId);
        // Responses APIがHTTP成功後のstructured-output復元で失敗した場合、SDK errorに
        // 2xx statusだけが残ることがある。合計3回の上限内で同じmodelを再試行する。
        const policy = aiRetryPolicy(error);
        const reason = safeAIRequestReason(error);
        logger.warn({
          matchId: context.matchId,
          callKey: context.callKey,
          attempt: attempt + 1,
          retryKind: policy.kind,
          reason,
        }, 'AI decision attempt failed');
        if (!policy.retryable || attempt === MAX_AI_ATTEMPTS - 1) {
          throw new AIRequestError('AI判断を取得できませんでした。', context.phase, reason);
        }
      }
    }
    throw new AIRequestError('AI判断を取得できませんでした。', context.phase, 'request_error');
  }
}
