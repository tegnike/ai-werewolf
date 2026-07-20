import { describe, expect, it } from 'vitest';
import { ClaimContractError } from '@/domain/claims';
import { MAX_AI_ATTEMPTS, aiRetryPolicy, safeAIRequestReason } from '@/server/ai/client';

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
});
