import { addressBookForSeat, addressTermFor } from '@/domain/agents';
import type { DecisionContext, DecisionProvider, SeatId, SpeechDecision, SpeechIntentDecision, SpeechMotivation, TargetDecision } from '@/domain/types';
import { stableIndex } from '@/engine/prng';

const observations: Record<string, string[]> = {
  'seat-1': [
    'うーん、みんな少し熱くなっていますね。さくらさんの話も、もう一度ちゃんと聞いてから決めませんか？ 私、置いていくのは心配で。',
    '待ってくださいね。レナさんを疑う気持ちは分かるんですけど、今ここで決め打ちするのは……私はちょっと怖いです。',
    '剛さん、短くてもいいので理由だけ教えてください。黙ったまま投票になるの、私にはどうしても不安なんです。',
  ],
  'seat-2': [
    'え、今の急な乗っかり方、ちょっと怪しくない？ いや、勘だけどさ。征司さんの顔色を見て決めた感じした！',
    'ごめん、さっきのは言いすぎたかも。でもレナの「絶対」はやっぱ引っかかるんだよねー。',
    'わかんないけど、ひよりちゃんが急に黙ったの気になる！ ……こういう勘、外すんだけどね。',
  ],
  'seat-3': [
    'こはるちゃんの反応、私はけっこう素直に見えたけどな。剛さんはどうしてそう思ったの？ 怒らないから聞かせてほしい。',
    'えっ、私が便乗？ そんなつもりじゃ……。澪さん、さっきの私の言い方、そんなふうに聞こえました？',
    'ひよりちゃんが話しづらそうなの、ちょっと気になる。急かさないから、誰が怖いと思ったかだけ聞いてもいい？',
  ],
  'seat-4': [
    'すみません、細かいかもしれませんが……真壁さん、さっきは「信じる」と言ったのに、今は疑っているんですよね。その間が気になります。',
    '私の勘違いなら本当にごめんなさい。でも、青木さんの説明、結論が先に決まっていたようにも聞こえて……。',
    '待って、今決めるんですか？ 私、まだ神崎さんの言葉を整理できていなくて。間違えるのが怖いです。',
  ],
  'seat-5': [
    '私はしずくを疑う。前置きばかりで、結局誰にも嫌われたくないだけに見える。違うなら私を納得させて。',
    'その程度の反論で私が引くと思った？ 征司、進行役の顔をして自分だけ安全な場所にいるよね。',
    '……そこは私の読み違い。訂正する。でも、こはるへの疑いまで取り下げる気はない。話は別よ。',
  ],
  'seat-6': [
    '長い。で、誰を疑ってる。',
    '後づけに見える。俺は信用しない。',
    '宮下は庇いすぎだ。理由が「いい人そう」じゃ話にならん。',
  ],
  'seat-7': [
    '俺は澪さんを信じたい！ あんなに皆のこと気にしてる人が、仲間を売るようには見えないんだよ。',
    'いや、それは違うだろレナ！ しずくは怖くてもちゃんと話した。俺はそういう覚悟を信じる！',
    '悪い、さっきのは俺が熱くなりすぎた！ でも黙って引く気はない。今度はちゃんと聞かせてくれ。',
  ],
  'seat-8': [
    'まあ、焦らずに。今日は候補を二人に絞れば十分です。八木さん、思いつきだけで場を乱すのは感心しませんね。',
    '先を考えれば分かることです。ここで真壁くんの感情に付き合って、明日の材料を失うべきではないでしょう。',
    '……困りましたね。私の想定とは違いますが、今さら進行を崩すより、この線で行くしかありません。',
  ],
  'seat-9': [
    'あの……さくらさん、さっきは迷っていたのに、今は急に言い切りました。気のせい、でしょうか。',
    'うまく言えないけど……征司さんが決めた順番に、みんなが乗せられている感じがして、少し怖いです。',
    'レナさんは嘘をついています。……ごめんなさい。でも、その言い直しだけは、偶然に聞こえませんでした。',
  ],
};

export class MockAI implements DecisionProvider {
  async speech(context: DecisionContext): Promise<SpeechDecision> {
    if (context.kind === 'speech' && context.claimDirective) {
      const directive = context.claimDirective;
      if (directive.mode !== 'forbidden' && directive.claimedRole) {
        const roleLabel = directive.claimedRole === 'seer' ? '占い師' : '霊媒師';
        const resultSpeech = directive.results.map((result) => {
          const verdict = result.verdict === '人狼' ? '人狼でした' : '人狼ではありませんでした';
          return `${result.day}日目の${addressTermFor(context.actor.seat, result.targetSeat)}は${verdict}`;
        }).join('。');
        const speech = `私は${roleLabel}です。${resultSpeech || '今は伝えられる結果はありません。'}`;
        const addressedTo = directive.counterTargetSeat && context.legalTargets.includes(directive.counterTargetSeat)
          ? directive.counterTargetSeat
          : null;
        return {
          speech,
          addressedTo,
          requestsReply: false,
          claim: { claimedRole: directive.claimedRole, results: directive.results.map((result) => ({ ...result })) },
          ...(context.discussion?.version === 'v3' ? {
            structure: { primaryAct: 'role_claim' as const, questionTopic: null, suspicion: null, voteIntent: null, boardAnalysis: false },
          } : {}),
        };
      }
    }
    const candidates = observations[context.actor.seat] ?? ['公開情報をもう一度確認します。'];
    const index = stableIndex(context.seed, context.callKey, candidates.length);
    const prefix = context.wolfChat?.mode === 'monologue'
      ? '……もう相談相手はいない。次の襲撃を自分で決めるなら、'
      : context.kind === 'wolf_speech' ? '襲撃方針として、' : '';
    const speech = `${prefix}${candidates[index]}`;
    const addressedTo = Object.entries(addressBookForSeat(context.actor.seat))
      .find(([seat, term]) => context.legalTargets.includes(seat as SeatId) && speech.includes(term ?? ''))?.[0] as SeatId | undefined;
    const structureTarget = context.players.filter((player) => player.alive && player.seat !== context.actor.seat)[
      stableIndex(context.seed, `${context.callKey}-structure-target`, context.players.filter((player) => player.alive && player.seat !== context.actor.seat).length)
    ]?.seat ?? null;
    const v3 = context.discussion?.version === 'v3';
    const shouldDeclareVote = v3 && (context.discussion?.turn ?? 0) >= 10 && Boolean(structureTarget);
    const shouldAnalyzeBoard = v3 && !shouldDeclareVote && (context.discussion?.turn ?? 0) % 4 === 0;
    const mockSuspicionBases = ['speech_content', 'statement_slip', 'reasoning_quality'] as const;
    const suspicionBasis = mockSuspicionBases[
      stableIndex(context.seed, `${context.callKey}-suspicion-basis`, mockSuspicionBases.length)
    ];
    const finalSpeech = shouldDeclareVote
      ? `今は${addressTermFor(context.actor.seat, structureTarget!)}に投票する。${speech}`
      : shouldAnalyzeBoard
        ? `役職の名乗りだけでなく、その他の発言と投票方針も見たい。${speech}`
        : v3 && structureTarget
          ? `今は${addressTermFor(context.actor.seat, structureTarget)}が少し気になる。${speech}`
          : speech;
    const decision: SpeechDecision = {
      speech: finalSpeech.slice(0, 200),
      addressedTo: addressedTo ?? null,
      requestsReply: context.wolfChat?.mode === 'monologue' || context.discussion?.canRequestReply === false
        ? false
        : Boolean(addressedTo && /[?？]|教えて|答えて|聞かせ|聞きたい|聞いてみたい/.test(speech)),
    };
    if (v3) {
      const answering = Boolean(context.discussion?.promptedBySeat);
      decision.structure = {
        primaryAct: answering ? 'answer' : shouldDeclareVote ? 'vote_intent' : shouldAnalyzeBoard ? 'board_analysis' : 'suspicion',
        questionTopic: answering || decision.requestsReply ? 'other' : null,
        suspicion: !answering && !shouldDeclareVote && !shouldAnalyzeBoard && structureTarget
          ? { targetSeat: structureTarget, basis: suspicionBasis, echoSourceSeat: null }
          : null,
        voteIntent: shouldDeclareVote ? structureTarget : null,
        boardAnalysis: shouldAnalyzeBoard,
      };
    }
    if (context.claimDirective) decision.claim = null;
    return decision;
  }

  async speechIntent(context: DecisionContext): Promise<SpeechIntentDecision> {
    if (context.discussion?.promptedBySeat) {
      const targetSeat = context.legalTargets.includes(context.discussion.promptedBySeat)
        ? context.discussion.promptedBySeat
        : null;
      return { urgency: 3, motivation: 'reply', targetSeat };
    }
    const urgency = stableIndex(context.seed, context.callKey, 4) as 0 | 1 | 2 | 3;
    if (urgency === 0) return { urgency, motivation: 'none', targetSeat: null };
    const motivations: SpeechMotivation[] = ['question', 'challenge', 'new_information', 'clarify'];
    const motivation = motivations[stableIndex(context.seed, `${context.callKey}-motivation`, motivations.length)];
    const targetSeat = context.legalTargets.length > 0
      ? context.legalTargets[stableIndex(context.seed, `${context.callKey}-target`, context.legalTargets.length)]
      : null;
    return { urgency, motivation, targetSeat };
  }

  async target(context: DecisionContext): Promise<TargetDecision> {
    const index = stableIndex(context.seed, context.callKey, context.legalTargets.length);
    return { targetSeat: context.legalTargets[index], statedReason: '公開情報と合法候補を比較した決定です。' };
  }
}
