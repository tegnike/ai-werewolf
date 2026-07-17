import { describe, expect, it } from 'vitest';
import type { DecisionContext } from '@/domain/types';
import { setupPlayers } from '@/engine/setup';
import { validateSpeechDisclosure } from '@/server/ai/disclosure';

const decision = (speech: string) => ({ speech, addressedTo: null, requestsReply: false });

function seerContext(publicHistory: string[] = []): DecisionContext {
  const players = setupPlayers('disclosure');
  const actor = { ...players[1], role: 'seer' as const };
  return {
    matchId: 'test', callKey: 'd1-speech', seed: 'disclosure', day: 1, phase: 'discussion', kind: 'speech', actor,
    players: players.map((player) => player.seat === actor.seat ? actor : player), legalTargets: [], publicHistory,
    privateFacts: ['自分の役職: seer', '青木 征司: 人狼'], round: 1,
  };
}

function mediumContext(): DecisionContext {
  const players = setupPlayers('disclosure-medium');
  const actor = { ...players[4], role: 'medium' as const };
  return {
    matchId: 'test', callKey: 'd2-speech', seed: 'disclosure-medium', day: 2, phase: 'discussion', kind: 'speech', actor,
    players: players.map((player) => player.seat === actor.seat ? actor : player), legalTargets: [], publicHistory: [],
    privateFacts: ['自分の役職: medium', '青木 征司: 人狼ではない'], round: 1,
  };
}

describe('能力結果の公開', () => {
  it('初回に役職を名乗らず結果だけを断定する発言を拒否する', () => {
    expect(() => validateSpeechDisclosure(seerContext(), decision('征司さんが人狼だったよ。'))).toThrow('claim is required');
  });

  it('初回の役職名乗りと結果が同じ発言にあれば許可する', () => {
    expect(() => validateSpeechDisclosure(seerContext(), decision('私は占い師です。征司さんは人狼でした。'))).not.toThrow();
  });

  it('公開履歴で役職を名乗り済みなら結果だけの続報を許可する', () => {
    expect(() => validateSpeechDisclosure(seerContext(['八木 こはる: 私が占い師です。']), decision('今日の結果は人狼でした。'))).not.toThrow();
  });

  it('霊媒師も役職を名乗らない白結果公開を拒否する', () => {
    expect(() => validateSpeechDisclosure(mediumContext(), decision('征司さんは人狼ではありませんでした。'))).toThrow('claim is required');
  });

  it('アルファベット略語を含む発言は役職にかかわらず拒否する', () => {
    const context = { ...seerContext(), actor: { ...seerContext().actor, role: 'villager' as const } };
    expect(() => validateSpeechDisclosure(context, decision('陽太さんの占いCOが遅いです。'))).toThrow('abbreviated role claim is forbidden');
    expect(() => validateSpeechDisclosure(context, decision('征司さんは霊媒ＣＯでした。'))).toThrow('abbreviated role claim is forbidden');
  });

  it('真役職を参照せず、directiveで認可された狂人の偽主張を許可する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'madman' },
      claimDirective: {
        mode: 'must', claimedRole: 'seer', counterTargetSeat: null,
        results: [{ day: 0, targetSeat: 'seat-2', verdict: '人狼ではない' }],
      },
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '私は占い師です。0日目の八木 こはるさんは人狼ではありませんでした。',
      addressedTo: null,
      requestsReply: false,
      claim: { claimedRole: 'seer', results: [{ day: 0, targetSeat: 'seat-2', verdict: '人狼ではない' }] },
    })).not.toThrow();
  });

  it('人格の呼称と自然な過去形で認可結果を伝えられる', () => {
    const base = seerContext();
    const result = { day: 1, targetSeat: 'seat-8' as const, verdict: '人狼ではない' as const };
    expect(() => validateSpeechDisclosure({
      ...base,
      claimDirective: { mode: 'may', claimedRole: 'seer', results: [result], counterTargetSeat: null },
    }, {
      speech: '私は占い師です。1日目に見た征司さんは人狼ではなかった。',
      addressedTo: null,
      requestsReply: false,
      claim: { claimedRole: 'seer', results: [result] },
    })).not.toThrow();
  });

  it('mustの構造欠落と、forbidden中の一人称役職名乗りを拒否する', () => {
    const base = seerContext();
    expect(() => validateSpeechDisclosure({
      ...base,
      claimDirective: { mode: 'must', claimedRole: 'seer', results: [], counterTargetSeat: null },
    }, { ...decision('今日は話を聞きます。'), claim: null })).toThrow('required_claim_missing');
    expect(() => validateSpeechDisclosure({
      ...base,
      claimDirective: { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null },
    }, { ...decision('私は占い師です。'), claim: null })).toThrow('claim_missing_from_structure');
  });

  it.each(['forbidden', 'may'] as const)('%s中は構造化claimなしの確認済み正体と伏せ結果の匂わせを拒否する', (mode) => {
    const base = seerContext();
    expect(() => validateSpeechDisclosure({
      ...base,
      claimDirective: {
        mode, claimedRole: mode === 'forbidden' ? null : 'seer',
        results: mode === 'forbidden' ? [] : [{ day: 0, targetSeat: 'seat-6', verdict: '人狼ではない' }],
        counterTargetSeat: null,
      },
    }, {
      speech: '剛さんは村人だと確認できていますが、今はまだ私からは言えません。',
      addressedTo: null,
      requestsReply: false,
      claim: null,
    })).toThrow('unstructured_private_result');
  });

  it('構造化claimなしでも公開情報に基づく村人らしいという推理は許可する', () => {
    const base = seerContext();
    expect(() => validateSpeechDisclosure({
      ...base,
      claimDirective: { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null },
    }, {
      speech: '剛さんは発言が一貫していて、今のところ村人らしく見えます。',
      addressedTo: null,
      requestsReply: false,
      claim: null,
    })).not.toThrow();
  });

  it.each([
    '占い結果はありますが、今はまだ言えません。',
    '正体は分かっていますが、まだ明かせません。',
  ])('具体的な白黒を言わなくても非公開結果の存在を匂わせる発言を拒否する: %s', (speech) => {
    const base = seerContext();
    expect(() => validateSpeechDisclosure({
      ...base,
      claimDirective: { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null },
    }, { ...decision(speech), claim: null })).toThrow('unstructured_private_result');
  });

  it('1日目の最初の話者が未発言者の態度を観察したように疑うことを拒否する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' },
      privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'opening', turn: 1 },
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんの強い出方が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'intuition' }, voteIntent: null, boardAnalysis: false,
      },
    })).toThrow('opening_intuition_unmarked');
    expect(() => validateSpeechDisclosure(context, {
      speech: 'まだ材料がないので、澪さんを勘で仮置きします。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'intuition' }, voteIntent: null, boardAnalysis: false,
      },
    })).not.toThrow();
  });

  it('途中ターンでも未発言者の今日の態度を疑いの根拠にすることを拒否する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' },
      privateFacts: ['自分の役職: villager'],
      discussion: {
        version: 'v3', stage: 'opening', turn: 4,
        remainingUnspokenSeats: ['seat-1', 'seat-3'],
      },
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんの便乗が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'interaction' }, voteIntent: null, boardAnalysis: false,
      },
    })).toThrow('unspoken_target_behavior');
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんはまだ発言前なので、勘の仮置きです。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'intuition' }, voteIntent: null, boardAnalysis: false,
      },
    })).not.toThrow();
  });

  it('本文に名前のない疑い先メタデータは再試行せず安全に破棄する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' },
      privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'opening', turn: 5, remainingUnspokenSeats: [] },
    };
    const speechDecision = {
      speech: '今日は発言を見比べます。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion' as const, questionTopic: null,
        suspicion: { targetSeat: 'seat-1' as const, basis: 'speech_content' as const },
        voteIntent: null, boardAnalysis: false,
      },
    };
    expect(() => validateSpeechDisclosure(context, speechDecision)).not.toThrow();
    expect(speechDecision.structure.suspicion).toBeNull();
    expect(speechDecision.structure.primaryAct).toBe('other');
  });
});
