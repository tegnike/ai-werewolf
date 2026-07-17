import { describe, expect, it } from 'vitest';
import { ClaimContractError } from '@/domain/claims';
import { aiRetryPolicy, safeAIRequestReason } from '@/server/ai/client';

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

  it('失敗種別ごとに再試行上限を分ける', () => {
    expect(aiRetryPolicy(new ClaimContractError('bad_contract', 'repair'))).toEqual({ kind: 'contract', limit: 2 });
    expect(aiRetryPolicy(new Error('Structured output was not parsed'))).toEqual({ kind: 'structured_output', limit: 3 });
    expect(aiRetryPolicy({ status: 503 })).toEqual({ kind: 'transport', limit: 5 });
    expect(aiRetryPolicy({ status: 400 })).toEqual({ kind: 'non_retryable', limit: 1 });
  });
});
