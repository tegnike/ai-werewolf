import { describe, expect, it } from 'vitest';
import {
  assertClaimWithinDirective, claimBoardDigest, foldClaim, type ClaimDirective, type ClaimLedger,
} from '@/domain/claims';

const directive: ClaimDirective = {
  mode: 'must',
  claimedRole: 'seer',
  results: [{ day: 0, targetSeat: 'seat-2', verdict: '人狼ではない' }],
  counterTargetSeat: null,
};

describe('公開役職主張', () => {
  it('発言イベントだけからCOと複数日の結果を累積する', () => {
    let ledger: ClaimLedger = [];
    ledger = foldClaim(ledger, {
      seat: 'seat-1', name: '名取 澪', day: 1, stage: 'opening',
      claim: { claimedRole: 'seer', results: [{ day: 0, targetSeat: 'seat-2', verdict: '人狼ではない' }] },
    });
    ledger = foldClaim(ledger, {
      seat: 'seat-1', name: '名取 澪', day: 2, stage: 'opening',
      claim: { claimedRole: 'seer', results: [{ day: 1, targetSeat: 'seat-3', verdict: '人狼' }] },
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ claimedRole: 'seer', coDay: 1 });
    expect(ledger[0].results).toHaveLength(2);
    expect(claimBoardDigest(ledger)[0]).toContain('占い師を名乗っています');
  });

  it('同じ対象日の矛盾結果と役職変更を拒否する', () => {
    const ledger = foldClaim([], {
      seat: 'seat-1', name: '名取 澪', day: 1, stage: 'opening',
      claim: { claimedRole: 'seer', results: [{ day: 0, targetSeat: 'seat-2', verdict: '人狼ではない' }] },
    });
    expect(() => foldClaim(ledger, {
      seat: 'seat-1', name: '名取 澪', day: 2, stage: 'opening',
      claim: { claimedRole: 'seer', results: [{ day: 0, targetSeat: 'seat-2', verdict: '人狼' }] },
    })).toThrow('contradictory_target_result');
    expect(() => foldClaim(ledger, {
      seat: 'seat-1', name: '名取 澪', day: 2, stage: 'opening',
      claim: { claimedRole: 'medium', results: [] },
    })).toThrow('role_switch');
  });

  it('directive外の役職・結果、必須主張の欠落、禁止中の主張を拒否する', () => {
    expect(() => assertClaimWithinDirective(null, directive)).toThrow('required_claim_missing');
    expect(() => assertClaimWithinDirective({ claimedRole: 'medium', results: [] }, directive)).toThrow('wrong_claimed_role');
    expect(() => assertClaimWithinDirective({ claimedRole: 'seer', results: [] }, directive)).toThrow('unauthorized_result');
    expect(() => assertClaimWithinDirective({ claimedRole: 'seer', results: directive.results }, directive)).not.toThrow();
    expect(() => assertClaimWithinDirective({ claimedRole: 'seer', results: [] }, {
      mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null,
    })).toThrow('forbidden_claim');
  });
});
