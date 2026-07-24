import { afterEach, describe, expect, it } from 'vitest';
import { ClaimContractError } from '@/domain/claims';
import {
  MAX_AI_ATTEMPTS, aiRetryPolicy, geminiThinkingConfig, openAiReasoningConfig, safeAIRequestReason,
} from '@/server/ai/client';
import {
  configuredLlmProvider, defaultGeminiThinkingLevel, DEFAULT_GEMINI_THINKING_BUDGET, DEFAULT_OPENAI_REASONING_EFFORT,
  isGeminiThinkingBudget, isOpenAiReasoningEffort, modelForProvider,
} from '@/server/ai/provider';

afterEach(() => {
  delete process.env.LLM_PROVIDER;
  delete process.env.GEMINI_MODEL;
});

describe('safeAIRequestReason', () => {
  it('HTTPエラーから許可した短い診断情報だけを残す', () => {
    expect(safeAIRequestReason({
      status: 400,
      code: 'invalid_request_error',
      type: 'invalid_request_error',
      param: 'text.format.schema',
      message: 'promptや秘密を含み得る本文',
    })).toBe('http_400:invalid_request_error:invalid_request_error:text.format.schema');
  });

  it('安全でない文字列と本文は診断情報へ混入させない', () => {
    expect(safeAIRequestReason({ status: 503, code: 'bad secret value', message: 'private data' })).toBe('http_503');
  });

  it('claim契約違反は本文を含めず分類する', () => {
    expect(safeAIRequestReason(new ClaimContractError('forbidden_claim', 'repair safely'))).toBe('claim_contract:forbidden_claim');
  });

  it('parse・Zod失敗は本文を保存せず構造化出力として分類する', () => {
    expect(safeAIRequestReason(new Error('Structured output was not parsed'))).toBe('structured_output');
    expect(safeAIRequestReason(new Error('Zod validation failed: private output'))).toBe('structured_output');
  });

  it('再試行可能な失敗を分類し、LLMコール総数を3回へ固定する', () => {
    expect(MAX_AI_ATTEMPTS).toBe(3);
    expect(aiRetryPolicy(new ClaimContractError('bad_contract', 'repair'))).toEqual({ kind: 'contract', retryable: true });
    expect(aiRetryPolicy(new Error('Structured output was not parsed'))).toEqual({ kind: 'structured_output', retryable: true });
    expect(aiRetryPolicy({ status: 503 })).toEqual({ kind: 'transport', retryable: true });
    expect(aiRetryPolicy({ status: 400 })).toEqual({ kind: 'non_retryable', retryable: false });
  });

  it('LLMプロバイダーごとのモデル設定を独立して解決する', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    expect(configuredLlmProvider()).toBe('gemini');
    expect(modelForProvider('openai')).toBe('gpt-5.6-luna');
    expect(modelForProvider('gemini')).toBe('gemini-3.5-flash-lite');
    process.env.GEMINI_MODEL = 'gemini-3.6-flash';
    expect(modelForProvider('gemini')).toBe('gemini-3.6-flash');
    process.env.GEMINI_MODEL = 'unsupported-model';
    expect(modelForProvider('gemini')).toBe('gemini-2.5-pro');
  });

  it('OpenAI推論レベルとGeminiモデル別の思考設定を検証する', () => {
    expect(DEFAULT_OPENAI_REASONING_EFFORT).toBe('low');
    expect(DEFAULT_GEMINI_THINKING_BUDGET).toBe(-1);
    expect(isOpenAiReasoningEffort('max')).toBe(true);
    expect(isOpenAiReasoningEffort('minimal')).toBe(false);
    expect(isGeminiThinkingBudget(-1)).toBe(true);
    expect(isGeminiThinkingBudget(128)).toBe(true);
    expect(isGeminiThinkingBudget(32_768)).toBe(true);
    expect(isGeminiThinkingBudget(0)).toBe(false);
    expect(isGeminiThinkingBudget(32_769)).toBe(false);
    expect(openAiReasoningConfig('xhigh')).toEqual({ effort: 'xhigh' });
    expect(defaultGeminiThinkingLevel('gemini-3.6-flash')).toBe('medium');
    expect(defaultGeminiThinkingLevel('gemini-3.5-flash-lite')).toBe('minimal');
    expect(geminiThinkingConfig('gemini-2.5-pro', 8_192, 'medium')).toEqual({ thinkingBudget: 8_192 });
    expect(geminiThinkingConfig('gemini-3.6-flash', -1, 'medium')).toEqual({ thinkingLevel: 'MEDIUM' });
    expect(geminiThinkingConfig('gemini-3.5-flash-lite', -1, 'minimal')).toEqual({ thinkingLevel: 'MINIMAL' });
    expect(geminiThinkingConfig('gemini-3.5-flash-lite', -1, 'low')).toEqual({ thinkingLevel: 'LOW' });
    expect(geminiThinkingConfig('gemini-3.5-flash-lite', -1, 'high')).toEqual({ thinkingLevel: 'HIGH' });
  });
});
