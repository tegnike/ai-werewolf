import { MODEL as OPENAI_MODEL } from '@/domain/constants';
import { GEMINI_MODELS, OPENAI_REASONING_EFFORTS } from '@/domain/types';
import type {
  GeminiModel, GeminiThinkingBudget, GeminiThinkingLevel, LlmProvider, OpenAiReasoningEffort,
} from '@/domain/types';

export const DEFAULT_LLM_PROVIDER: LlmProvider = 'openai';
export const DEFAULT_GEMINI_MODEL: GeminiModel = GEMINI_MODELS[0];
export const DEFAULT_OPENAI_REASONING_EFFORT: OpenAiReasoningEffort = 'low';
export const DEFAULT_GEMINI_THINKING_BUDGET: GeminiThinkingBudget = -1;
export const DEFAULT_GEMINI_THINKING_LEVEL: GeminiThinkingLevel = 'minimal';

export function defaultGeminiThinkingLevel(model: string): GeminiThinkingLevel {
  return model === 'gemini-3.6-flash' ? 'medium' : DEFAULT_GEMINI_THINKING_LEVEL;
}

export function configuredLlmProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === 'gemini' ? 'gemini' : DEFAULT_LLM_PROVIDER;
}

export function modelForProvider(provider: LlmProvider): string {
  if (provider === 'gemini') {
    const configured = process.env.GEMINI_MODEL?.trim();
    return GEMINI_MODELS.includes(configured as GeminiModel) ? configured! : DEFAULT_GEMINI_MODEL;
  }
  return OPENAI_MODEL;
}

export function modelForCharacterLlm(llm: import('@/domain/characters').CharacterLlmSettings): string {
  return llm.provider === 'gemini' ? llm.model : OPENAI_MODEL;
}

export function hasApiKey(provider: LlmProvider): boolean {
  return provider === 'gemini' ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.OPENAI_API_KEY);
}

export function apiKeyForProvider(provider: LlmProvider): string | undefined {
  return provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
}

export function isOpenAiReasoningEffort(value: unknown): value is OpenAiReasoningEffort {
  return typeof value === 'string' && OPENAI_REASONING_EFFORTS.includes(value as OpenAiReasoningEffort);
}

export function isGeminiThinkingBudget(value: unknown): value is GeminiThinkingBudget {
  return typeof value === 'number' && Number.isInteger(value) && (value === -1 || (value >= 128 && value <= 32_768));
}
