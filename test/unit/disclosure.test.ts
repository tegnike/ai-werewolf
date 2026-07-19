import { describe, expect, it } from 'vitest';
import type { DecisionContext, SpeechDecision } from '@/domain/types';
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
  it('自分を自分の名前と敬称で呼ぶ一人称崩れを拒否する', () => {
    const context = seerContext();
    expect(() => validateSpeechDisclosure(context, decision('こはるさんは占い師です。'))).toThrow('self_reference_drift');
    expect(() => validateSpeechDisclosure(context, decision('私は占い師です。'))).not.toThrow();

    const players = setupPlayers('first-person-drift');
    const actor = { ...players[6], role: 'villager' as const };
    const hotBloodedContext: DecisionContext = {
      ...context, actor, players: players.map((player) => player.seat === actor.seat ? actor : player),
      privateFacts: ['自分の役職: villager'],
    };
    expect(() => validateSpeechDisclosure(hotBloodedContext, decision('俺は人狼じゃない。私は話を聞きたい。')))
      .toThrow('first_person_drift');
    expect(() => validateSpeechDisclosure(hotBloodedContext, decision('俺は話を聞きたい。'))).not.toThrow();
  });

  it('1日目は0日目の占い先理由の質問と信用評価を発言契約で拒否する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' },
      privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'opening', turn: 4 },
    };
    const speech = (text: string, question = false): SpeechDecision => ({
      speech: text, addressedTo: question ? 'seat-1' : null, requestsReply: question,
      structure: {
        primaryAct: question ? 'question' : 'board_analysis',
        questionTopic: question ? 'inspection_reason' : null,
        suspicion: null, voteIntent: null, boardAnalysis: false,
      },
    });
    for (const text of [
      '役職を名乗る人が出たら、なぜそこを見たのか聞きたいです。',
      '澪さん、なぜ陽太さんを選んだか、結果以外の説明を聞かせてください。',
      '澪さん、その結果に至った理由を逃げずに話してください。',
      '澪さんは占い先の説明が弱くて信用できません。',
      'レナさんは占い先に理由がない点まで先に説明していて、一歩具体的に見えました。',
    ]) {
      expect(() => validateSpeechDisclosure(context, speech(text, text.includes('聞き') || text.includes('話して'))))
        .toThrow('night_zero_reason_is_not_evidence');
    }
    expect(() => validateSpeechDisclosure(context, speech(
      '0日目は無情報なので占い先の理由を求めません。名乗った後の反応を比べます。',
    ))).not.toThrow();
    expect(() => validateSpeechDisclosure({ ...context, day: 2 }, speech(
      '澪さんは昨夜の占い先を選んだ理由を説明してください。', true,
    ))).not.toThrow();
    expect(() => validateSpeechDisclosure(context, speech(
      '澪さん、なぜ陽太さんを処刑候補に選んだか説明してください。', true,
    ))).not.toThrow();
  });

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

  it('白黒の略語を拒否し、自然な結果表現と黒田の姓は許可する', () => {
    const context = { ...seerContext(), actor: { ...seerContext().actor, role: 'villager' as const } };
    for (const speech of [
      '征司さんへの黒を信じます。',
      '初手黒を出した人が気になります。',
      '結果が白ばかりなのが気になります。',
    ]) {
      expect(() => validateSpeechDisclosure(context, decision(speech))).toThrow('abbreviated_alignment_term');
    }
    expect(() => validateSpeechDisclosure(context, decision('人狼ではないという結果ばかりなのが気になります。'))).not.toThrow();
    expect(() => validateSpeechDisclosure(context, decision('黒田さんの発言が気になります。'))).not.toThrow();
  });

  it('真役職を参照せず、directiveで認可された狂人の偽主張を許可する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'madman' },
      claimDirective: {
        mode: 'must', claimedRole: 'seer', counterTargetSeat: null,
        results: [{ day: 0, targetSeat: 'seat-3', verdict: '人狼ではない' }],
      },
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '私は占い師です。0日目のさくらちゃんは人狼ではありませんでした。',
      addressedTo: null,
      requestsReply: false,
      claim: { claimedRole: 'seer', results: [{ day: 0, targetSeat: 'seat-3', verdict: '人狼ではない' }] },
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
        suspicion: { targetSeat: 'seat-1', basis: 'intuition', evidenceDay: null }, voteIntent: null, boardAnalysis: false,
      },
    })).toThrow('opening_intuition_unmarked');
    expect(() => validateSpeechDisclosure(context, {
      speech: 'まだ材料がないので、澪さんを勘で仮置きします。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'intuition', evidenceDay: null }, voteIntent: null, boardAnalysis: false,
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
        suspicion: { targetSeat: 'seat-1', basis: 'interaction', evidenceDay: 1 }, voteIntent: null, boardAnalysis: false,
      },
    })).toThrow('unspoken_target_behavior');
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんはまだ発言前なので、勘の仮置きです。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'intuition', evidenceDay: null }, voteIntent: null, boardAnalysis: false,
      },
    })).not.toThrow();
  });

  it('2日目以降は未発言者でも前日以前の公開情報を疑いの根拠にできる', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      day: 4,
      actor: { ...base.actor, role: 'villager' },
      privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'opening', turn: 1, remainingUnspokenSeats: ['seat-1'] },
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんの3日目の投票理由が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'vote_plan', evidenceDay: 3 }, voteIntent: null, boardAnalysis: false,
      },
    })).not.toThrow();
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんの今日の便乗が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'interaction', evidenceDay: 4 }, voteIntent: null, boardAnalysis: false,
      },
    })).toThrow('unspoken_target_behavior');
  });

  it('疑いの未来日と、勘以外で根拠日がない応答を拒否する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' }, privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'opening', turn: 2, remainingUnspokenSeats: [] },
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんの発言が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'speech_content', evidenceDay: 2 }, voteIntent: null, boardAnalysis: false,
      },
    })).toThrow('future_suspicion_evidence');
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんの発言が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'speech_content', evidenceDay: null }, voteIntent: null, boardAnalysis: false,
      },
    })).toThrow('suspicion_evidence_day_missing');
  });

  it('台詞にない投票予定・質問分類・盤面整理は再試行せず安全に破棄する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' }, privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'free', turn: 10, remainingUnspokenSeats: [] },
    };
    const speechDecision: SpeechDecision = {
      speech: '今日は澪さんの説明をもう一度見直します。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'vote_intent', questionTopic: 'gray_read', suspicion: null,
        voteIntent: 'seat-1', boardAnalysis: true,
      },
    };
    expect(() => validateSpeechDisclosure(context, speechDecision)).not.toThrow();
    expect(speechDecision.structure).toMatchObject({
      primaryAct: 'other', questionTopic: null, voteIntent: null, boardAnalysis: false,
    });
  });

  it('本文に名前のない疑い先メタデータは再試行せず安全に破棄する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' },
      privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'opening', turn: 5, remainingUnspokenSeats: [] },
    };
    const speechDecision: SpeechDecision = {
      speech: '今日は発言を見比べます。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion' as const, questionTopic: null,
        suspicion: { targetSeat: 'seat-1' as const, basis: 'speech_content' as const },
        voteIntent: null, boardAnalysis: false,
      },
    };
    expect(() => validateSpeechDisclosure(context, speechDecision)).not.toThrow();
    expect(speechDecision.structure!.suspicion).toBeNull();
    expect(speechDecision.structure!.primaryAct).toBe('other');
  });

  it('当日初発言で他者の公開行動を自分の過去行動へ誤帰属することを拒否する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' }, privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'opening', turn: 4, remainingUnspokenSeats: [] },
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '私が先に陽太さんの反応を求めたのは、本人の受け止めを見たかったからです。',
      addressedTo: null, requestsReply: false,
      structure: { primaryAct: 'board_analysis', questionTopic: null, suspicion: null, voteIntent: null, boardAnalysis: false },
    })).toThrow('opening_self_history_fabrication');
  });

  it('未公表の投票予定を以前から継続しているように話すことを拒否する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' }, privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'free', turn: 10, remainingUnspokenSeats: [] },
    };
    const structure = {
      primaryAct: 'vote_intent' as const, questionTopic: null,
      suspicion: null, voteIntent: 'seat-1' as const, boardAnalysis: false,
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '私はまだ澪さんへの投票予定を変えません。', addressedTo: null, requestsReply: false, structure,
    })).toThrow('nonexistent_prior_vote_intent');
    expect(() => validateSpeechDisclosure(context, {
      speech: '私は澪さんに投票します。', addressedTo: null, requestsReply: false, structure: { ...structure },
    })).not.toThrow();
  });

  it('発言済みの人物を未発言・未確認として扱うことを拒否し訂正は許可する', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' }, privateFacts: ['自分の役職: villager'],
      discussion: {
        version: 'v3', stage: 'opening', turn: 8,
        remainingUnspokenSeats: ['seat-3', 'seat-6', 'seat-7', 'seat-8', 'seat-9'],
      },
    };
    const structure = {
      primaryAct: 'vote_intent' as const, questionTopic: null,
      suspicion: null, voteIntent: 'seat-5' as const, boardAnalysis: false,
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '現時点では発言を聞けていない神崎さんへ投票します。',
      addressedTo: null, requestsReply: false, structure,
    })).toThrow('spoken_player_treated_as_unspoken');
    expect(() => validateSpeechDisclosure(context, {
      speech: '神崎さんの発言を見落としていました。訂正して投票先を考え直します。',
      addressedTo: null, requestsReply: false,
      structure: { ...structure, primaryAct: 'defense', voteIntent: null },
    })).not.toThrow();
    expect(() => validateSpeechDisclosure(context, {
      speech: '神崎さんの発言には対抗との比較がないので、説明不足だと思います。',
      addressedTo: null, requestsReply: false,
      structure: { ...structure, primaryAct: 'board_analysis', voteIntent: null },
    })).not.toThrow();
  });

  it('同一話者の変更のない投票予定再宣言を再試行せずagreementへ格下げする', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' },
      privateFacts: ['自分の役職: villager'],
      discussion: {
        version: 'v3', stage: 'free', turn: 12,
        priorVoteIntentTarget: 'seat-1', remainingUnspokenSeats: [],
      },
    };
    const speechDecision: SpeechDecision = {
      speech: '予定は変えず、澪さんに投票します。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'vote_intent' as const, questionTopic: null,
        suspicion: null, voteIntent: 'seat-1' as const, boardAnalysis: false,
      },
    };

    expect(() => validateSpeechDisclosure(context, speechDecision)).not.toThrow();
    expect(speechDecision.structure!.primaryAct).toBe('agreement');
    expect(speechDecision.contributionDemoted).toBe(true);
  });

  it('3人以上が予定を公表した候補への追加投票宣言を拒否し最終投票は拘束しない', () => {
    const base = seerContext();
    const context: DecisionContext = {
      ...base,
      actor: { ...base.actor, role: 'villager' },
      privateFacts: ['自分の役職: villager'],
      discussion: { version: 'v3', stage: 'free', turn: 12, consensusTarget: 'seat-1', remainingUnspokenSeats: [] },
    };
    expect(() => validateSpeechDisclosure(context, {
      speech: '今日は澪さんに投票します。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'vote_intent', questionTopic: null,
        suspicion: { targetSeat: 'seat-1', basis: 'speech_content' }, voteIntent: 'seat-1', boardAnalysis: false,
      },
    })).toThrow('consensus_vote_declaration_repeated');
    expect(() => validateSpeechDisclosure(context, {
      speech: '澪さんの説明には反証が足りません。剛さんはどう見ていますか。', addressedTo: 'seat-6', requestsReply: true,
      structure: {
        primaryAct: 'question', questionTopic: 'gray_read',
        suspicion: { targetSeat: 'seat-1', basis: 'speech_content' }, voteIntent: null, boardAnalysis: false,
      },
    })).not.toThrow();
  });
});
