import { describe, expect, it } from 'vitest';
import type { ClaimLedger } from '@/domain/claims';
import { SANITIZED_VOTE_REASON } from '@/domain/constants';
import { sanitizePublicVoteReason } from '@/domain/public-reason';

describe('投票理由の公開契約', () => {
  it.each([
    '俺が霊媒師だ。久遠に入れる。',
    'わしが霊媒師じゃ。久遠に入れる。',
    'うち、占い師やで。福本さんに入れる。',
    '実は占い師です。今日は福本さんへ入れます。',
    '私は昨夜、福本さんを占いました。人狼でした。',
    '福本さんは占い結果で人狼でした。だから入れます。',
  ])('未宣言の自己役職・能力結果を中立理由へ置換する: %s', (reason) => {
    expect(sanitizePublicVoteReason(reason, 'seat-6', [])).toEqual({
      statedReason: SANITIZED_VOTE_REASON,
      reasonSanitized: true,
    });
  });

  it.each([
    '久遠さんの説明と福本さんの反応を比較して決めた。',
    '久遠さんが占った福本さんへの結果と、本人の反応を比べた。',
    '霊媒師を名乗る黒田さんの説明が信用できない。',
    '福本さんは人狼だと思うので投票する。',
  ])('他者の公開主張や通常の推理は保持する: %s', (reason) => {
    expect(sanitizePublicVoteReason(reason, 'seat-4', [])).toEqual({
      statedReason: reason,
      reasonSanitized: false,
    });
  });

  it('議論中に構造化済みの同一役職は投票理由で再言及できる', () => {
    const ledger: ClaimLedger = [{
      seat: 'seat-6', name: '黒田 剛', claimedRole: 'medium', coDay: 2, coStage: 'opening', results: [],
    }];
    const reason = '俺が霊媒師だと伝えた立場からも、久遠の説明は信用しない。';
    expect(sanitizePublicVoteReason(reason, 'seat-6', ledger)).toEqual({
      statedReason: reason,
      reasonSanitized: false,
    });
  });
});
