import { describe, expect, it } from 'vitest';
import type { ClaimLedger } from '@/domain/claims';
import { GENERIC_CLAIM_STRATEGY } from '@/domain/claim-strategies';
import {
  characterClaimDirectiveFor, claimDirectiveFor, decideClaimPolicies, planMadmanSeerFake, planWolfSeerFake,
  preserveFakeResultConsistency,
} from '@/engine/claim-policy';
import { setupPlayers } from '@/engine/setup';

describe('役職主張ポリシー', () => {
  it('同じseedで同じ方針になり、人狼の計画的な騙り担当は最大1名になる', () => {
    for (let index = 0; index < 100; index += 1) {
      const seed = `policy-${index}`;
      const players = setupPlayers(seed);
      const first = decideClaimPolicies(seed, players);
      const second = decideClaimPolicies(seed, players);
      expect([...first.entries()]).toEqual([...second.entries()]);
      const fakeWolves = [...first.values()].filter((policy) => policy.actualRole === 'werewolf' && policy.stance === 'fake');
      expect(fakeWolves.length).toBeLessThanOrEqual(1);
    }
  });

  it('claims v1の方針を凍結し、v2では占い師系の登場を初日標準へ寄せる', () => {
    let v2DayOne = 0;
    let v2Opening = 0;
    const matches = 1000;
    for (let index = 0; index < matches; index += 1) {
      const seed = `claim-version-${index}`;
      const players = setupPlayers(seed);
      expect([...decideClaimPolicies(seed, players).entries()])
        .toEqual([...decideClaimPolicies(seed, players, 'v1').entries()]);
      const seer = [...decideClaimPolicies(seed, players, 'v2').values()]
        .find((policy) => policy.actualRole === 'seer')!;
      if (seer.slot?.day === 1) v2DayOne += 1;
      if (seer.slot?.day === 1 && seer.slot.stage === 'opening') v2Opening += 1;
    }
    expect(v2DayOne / matches).toBeGreaterThanOrEqual(0.9);
    expect(v2DayOne / matches).toBeLessThan(1);
    expect(v2Opening / matches).toBeGreaterThanOrEqual(0.6);
    expect(v2Opening / matches).toBeLessThanOrEqual(0.85);
  });

  it('claims v2の真占い師は個人スロットが遅くても1日目turn 6で必須になる', () => {
    let fixture: { seed: string; players: ReturnType<typeof setupPlayers> } | undefined;
    for (let index = 0; index < 1000; index += 1) {
      const seed = `late-v2-seer-${index}`;
      const players = setupPlayers(seed);
      const seer = [...decideClaimPolicies(seed, players, 'v2').values()]
        .find((policy) => policy.actualRole === 'seer')!;
      if (seer.slot?.stage !== 'opening' || seer.slot.day > 1) {
        fixture = { seed, players };
        break;
      }
    }
    expect(fixture).toBeDefined();
    const seer = fixture!.players.find((player) => player.role === 'seer')!;
    const policy = decideClaimPolicies(fixture!.seed, fixture!.players, 'v2').get(seer.seat)!;
    const target = fixture!.players.find((player) => player.seat !== seer.seat)!.seat;
    const available = { seer: [{ day: 0, targetSeat: target, verdict: '人狼ではない' as const }], medium: [] };
    expect(claimDirectiveFor(fixture!.seed, policy, [], available, { day: 1, stage: 'opening', turn: 5 }).mode)
      .not.toBe('must');
    expect(claimDirectiveFor(fixture!.seed, policy, [], available, { day: 1, stage: 'opening', turn: 6 }).mode)
      .toBe('must');
  });

  it('claims v3は騙り役職を事前抽選せずLLMへ占い師・霊媒師・潜伏を認可する', () => {
    const seed = 'claims-v3-character-choice';
    const players = setupPlayers(seed);
    const policies = decideClaimPolicies(seed, players, 'v3');
    const madman = players.find((player) => player.role === 'madman')!;
    const wolf = players.find((player) => player.role === 'werewolf')!;
    expect(policies.get(madman.seat)).toMatchObject({ stance: 'choice', claimedRole: null });
    expect(policies.get(wolf.seat)).toMatchObject({ stance: 'choice', claimedRole: null });

    const target = players.find((player) => player.seat !== madman.seat)!.seat;
    const directive = characterClaimDirectiveFor(
      policies.get(madman.seat)!, [],
      { seer: [{ day: 0, targetSeat: target, verdict: '人狼ではない' }], medium: [] },
      { day: 1, stage: 'opening', turn: 1 }, GENERIC_CLAIM_STRATEGY,
    );
    expect(directive).toMatchObject({ mode: 'may', strategicChoice: true, claimedRole: null });
    expect(directive.options?.map((option) => option.claimedRole)).toEqual(['seer', 'medium']);
  });

  it('claims v3の真占い師は人格判断で待てるがturn 6から必須になる', () => {
    const seed = 'claims-v3-true-seer';
    const players = setupPlayers(seed);
    const seer = players.find((player) => player.role === 'seer')!;
    const policy = decideClaimPolicies(seed, players, 'v3').get(seer.seat)!;
    const target = players.find((player) => player.seat !== seer.seat)!.seat;
    const available = { seer: [{ day: 0, targetSeat: target, verdict: '人狼ではない' as const }], medium: [] };
    expect(characterClaimDirectiveFor(policy, [], available, {
      day: 1, stage: 'opening', turn: 5,
    }, GENERIC_CLAIM_STRATEGY).mode).toBe('may');
    expect(characterClaimDirectiveFor(policy, [], available, {
      day: 1, stage: 'opening', turn: 6,
    }, GENERIC_CLAIM_STRATEGY).mode).toBe('must');
  });

  it('claims v4は何人目のCOになるかを人格判断へ渡し、3人目を通常対抗扱いしない', () => {
    const seed = 'claims-v4-crowding';
    const players = setupPlayers(seed);
    const madman = players.find((player) => player.role === 'madman')!;
    const policy = decideClaimPolicies(seed, players, 'v4').get(madman.seat)!;
    const targets = players.filter((player) => player.seat !== madman.seat).slice(0, 3);
    const ledger = [
      {
        seat: targets[0].seat, name: targets[0].name, claimedRole: 'seer' as const,
        coDay: 1, coStage: 'opening' as const, results: [],
      },
      {
        seat: targets[1].seat, name: targets[1].name, claimedRole: 'seer' as const,
        coDay: 1, coStage: 'opening' as const, results: [],
      },
    ];
    const directive = characterClaimDirectiveFor(
      policy,
      ledger,
      { seer: [{ day: 0, targetSeat: targets[2].seat, verdict: '人狼ではない' }], medium: [] },
      { day: 1, stage: 'opening', turn: 8 },
      GENERIC_CLAIM_STRATEGY,
    );
    expect(directive.personalityContext).toMatchObject({
      existingRoleClaims: { seer: 2, medium: 0 }, actorBlackened: false, day: 1, turn: 8,
    });
    expect(directive.counterTargetSeat).toBeNull();
    expect(directive.options?.find((option) => option.claimedRole === 'seer')).toBeDefined();
  });

  it('狂人は人狼位置を入力せず偽結果を作り、seed群では狼への黒誤爆も起きる', () => {
    let accidentalBlack = false;
    for (let index = 0; index < 300; index += 1) {
      const seed = `madman-result-${index}`;
      const players = setupPlayers(seed);
      const madman = players.find((player) => player.role === 'madman')!;
      const result = planMadmanSeerFake(seed, madman.seat, 0, players.map((player) => player.seat));
      const target = players.find((player) => player.seat === result.targetSeat)!;
      if (target.role === 'werewolf' && result.verdict === '人狼') accidentalBlack = true;
    }
    expect(accidentalBlack).toBe(true);
  });

  it('人狼の偽占いは自分を対象にせず、仲間へ黒を出さない', () => {
    for (let index = 0; index < 300; index += 1) {
      const seed = `wolf-result-${index}`;
      const players = setupPlayers(seed);
      const wolves = players.filter((player) => player.role === 'werewolf');
      const actor = wolves[0];
      const partner = wolves[1];
      const result = planWolfSeerFake(seed, actor.seat, 0, players.map((player) => player.seat), [partner.seat]);
      expect(result.targetSeat).not.toBe(actor.seat);
      if (result.targetSeat === partner.seat) expect(result.verdict).toBe('人狼ではない');
    }
  });

  it('同じ対象を再び偽占いした場合は最初の白黒を維持する', () => {
    const history = [{ day: 0, targetSeat: 'seat-2' as const, verdict: '人狼ではない' as const }];
    expect(preserveFakeResultConsistency(history, {
      day: 2, targetSeat: 'seat-2', verdict: '人狼',
    })).toEqual({ day: 2, targetSeat: 'seat-2', verdict: '人狼ではない' });
  });

  it('真占い師の黒結果と対抗観測を必須主張へ変える', () => {
    const seed = 'truth-black';
    const players = setupPlayers(seed);
    const seer = players.find((player) => player.role === 'seer')!;
    const policy = decideClaimPolicies(seed, players).get(seer.seat)!;
    const ledger: ClaimLedger = [{
      seat: players.find((player) => player.seat !== seer.seat)!.seat,
      name: '対抗', claimedRole: 'seer', coDay: 1, coStage: 'opening', results: [],
    }];
    const target = players.find((player) => player.seat !== seer.seat)!.seat;
    const directive = claimDirectiveFor(seed, policy, ledger, {
      seer: [{ day: 0, targetSeat: target, verdict: '人狼' }], medium: [],
    }, { day: 1, stage: 'opening' });
    expect(directive.mode).toBe('must');
    expect(directive.claimedRole).toBe('seer');
  });
});
