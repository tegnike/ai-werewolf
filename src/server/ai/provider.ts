import { MODEL as OPENAI_MODEL } from '@/domain/constants';
import { OPENAI_REASONING_EFFORTS } from '@/domain/types';
import type { GeminiThinkingBudget, LlmProvider, OpenAiReasoningEffort } from '@/domain/types';

export const DEFAULT_LLM_PROVIDER: LlmProvider = 'openai';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_OPENAI_REASONING_EFFORT: OpenAiReasoningEffort = 'low';
export const DEFAULT_GEMINI_THINKING_BUDGET: GeminiThinkingBudget = -1;

export function configuredLlmProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === 'gemini' ? 'gemini' : DEFAULT_LLM_PROVIDER;
}

export function modelForProvider(provider: LlmProvider): string {
  if (provider === 'gemini') return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return OPENAI_MODEL;
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
