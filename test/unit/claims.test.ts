import { describe, expect, it } from 'vitest';
import {
  assertClaimIntentWithinDirective, assertClaimWithinDirective, claimBoardDigest, foldClaim,
  type ClaimDirective, type ClaimLedger,
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

  it('claims v3の複数候補と非公開intentを整合させる', () => {
    const strategic: ClaimDirective = {
      mode: 'may', claimedRole: null, results: [], counterTargetSeat: null, strategicChoice: true,
      options: [
        { claimedRole: 'seer', results: [{ day: 0, targetSeat: 'seat-2', verdict: '人狼ではない' }] },
        { claimedRole: 'medium', results: [] },
      ],
    };
    const seerClaim = strategic.options![0];
    expect(() => assertClaimWithinDirective(seerClaim, strategic)).not.toThrow();
    expect(() => assertClaimWithinDirective({ claimedRole: 'seer', results: [] }, strategic)).toThrow('unauthorized_result');
    expect(() => assertClaimIntentWithinDirective({
      action: 'claim_now', plannedRole: 'seer', trigger: 'opening',
    }, seerClaim, strategic)).not.toThrow();
    expect(() => assertClaimIntentWithinDirective({
      action: 'wait', plannedRole: 'seer', trigger: 'counterclaim',
    }, null, strategic)).not.toThrow();
    expect(() => assertClaimIntentWithinDirective({
      action: 'stay_hidden', plannedRole: null, trigger: 'none',
    }, null, strategic)).not.toThrow();
    expect(() => assertClaimIntentWithinDirective(undefined, null, strategic)).toThrow('claim_intent_missing');
    expect(() => assertClaimIntentWithinDirective({
      action: 'wait', plannedRole: 'seer', trigger: 'none',
    }, null, strategic)).toThrow('wait_trigger_missing');
    expect(() => assertClaimIntentWithinDirective({
      action: 'wait', plannedRole: null, trigger: 'pressure',
    }, null, strategic)).toThrow('wait_role_missing');
  });

  it('claims v4は非公開intentへ人格上の決定打を必須にする', () => {
    const directive: ClaimDirective = {
      mode: 'may', claimedRole: null, results: [], counterTargetSeat: null, strategicChoice: true,
      options: [{ claimedRole: 'seer', results: [] }],
      personalityContext: {
        existingRoleClaims: { seer: 2, medium: 0 }, actorBlackened: false,
        day: 1, stage: 'opening', turn: 5,
      },
    };
    expect(() => assertClaimIntentWithinDirective({
      action: 'stay_hidden', plannedRole: null, trigger: 'none',
    }, null, directive)).toThrow('claim_basis_missing');
    expect(() => assertClaimIntentWithinDirective({
      action: 'stay_hidden', plannedRole: null, trigger: 'none', basis: 'avoid_crowding',
    }, null, directive)).not.toThrow();
  });
});
