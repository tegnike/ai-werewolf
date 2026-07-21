import {
  characterAddressTerm, characterForSeat, characterRoleClaimSentence, DEFAULT_CHARACTER_ROSTER,
} from '@/domain/characters';
import type { DecisionContext, DecisionProvider, SeatId, SpeechDecision, SpeechIntentDecision, SpeechMotivation, TargetDecision } from '@/domain/types';
import { stableIndex } from '@/engine/prng';

const observations: Record<string, string[]> = {
  'seat-1': [
    'うーん、みんな少し熱くなっていますね。さくらさんの話も、もう一度ちゃんと聞いてから決めませんか？ 私、置いていくのは心配で。',
    '待ってくださいね。レナさんを疑う気持ちは分かるんですけど、今ここで決め打ちするのは……私はちょっと怖いです。',
    '剛さん、短くてもいいので理由だけ教えてください。黙ったまま投票になるの、私にはどうしても不安なんです。',
  ],
  'seat-2': [
    'ほんま？ 今の急な乗っかり方、なんでやねんって思ったで。源蔵じいちゃんの顔色見て決めたんとちゃう？',
    'ごめん、さっきのは言いすぎたわ！ せやけど、レナの「絶対」はやっぱ引っかかるねん。',
    'ひよりちゃん、急に静かになったんはなんで？ うちの早とちりやったら、そう言ってや！',
  ],
  'seat-3': [
    'ひなたちゃんの反応、私はけっこう素直に見えたけどな。剛さんはどうしてそう思ったの？ 怒らないから聞かせてほしい。',
    'えっ、私が便乗？ そんなつもりじゃ……。澪さん、さっきの私の言い方、そんなふうに聞こえました？',
    'ひよりちゃんが話しづらそうなの、ちょっと気になる。急かさないから、誰が怖いと思ったかだけ聞いてもいい？',
  ],
  'seat-4': [
    'すみません、細かいかもしれませんが……真壁さん、さっきは「信じる」と言ったのに、今は疑っているんですよね。その間が気になります。',
    '私の勘違いなら本当にごめんなさい。でも、福本さんの軽口、答えにくいところを笑いで流したようにも聞こえて……。',
    '待って、今決めるんですか？ 私、まだ神崎さんの言葉を整理できていなくて。間違えるのが怖いです。',
  ],
  'seat-5': [
    '私はしずくを疑う。前置きばかりで、結局誰にも嫌われたくないだけに見える。違うなら私を納得させて。',
    'その程度の反論で私が引くと思った？ 源蔵、笑って自分だけ安全な場所にいるよね。',
    '……そこは私の読み違い。訂正する。でも、ひなたへの疑いまで取り下げる気はない。話は別よ。',
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
    'ほっほ、ひなたちゃんのツッコミは威勢がええのう。じゃが今のは、笑って話をそらしたようにも見えたぞ。',
    '陽太、その勢いで屋根まで飛ぶつもりかの。まず、さっき澪ちゃんを庇った理由が抜けとるぞ。',
    'おっと、わしの早とちりじゃったか。こりゃまいった。じゃが笑ってごまかさず、今の反応から読み直すぞい。',
  ],
  'seat-9': [
    'あの……さくらさん、さっきは迷っていたのに、今は急に言い切りました。気のせい、でしょうか。',
    'うまく言えないけど……源蔵さんの笑いに、みんなが話を流されている感じがして、少し怖いです。',
    'レナさんは嘘をついています。……ごめんなさい。でも、その言い直しだけは、偶然に聞こえませんでした。',
  ],
};

const scarceLines: Record<SeatId, string> = {
  'seat-1': 'うーん、まだ決めるのは心配です。みなさんの話をもう少し聞かせてくださいね。',
  'seat-2': 'ほんままだわからんな！ うち、次の反応見てから決めるわ！',
  'seat-3': 'まだみんなの顔が見えないかな。私、もう少し話してから決めたいな。',
  'seat-4': 'すみません……まだ材料が少なくて、私は今決めるのが怖いです。',
  'seat-5': 'まだ決めない。ただ、次も曖昧に逃げる人は私が絞る。',
  'seat-6': '材料不足。まだ決めん。',
  'seat-7': 'まだ決められない！ 俺は、次に腹を割って話すやつを見たい！',
  'seat-8': 'ほっほ、まだわしの勘は眠ったままじゃ。もう少し話を聞かせてくれんかの。',
  'seat-9': 'あの……わたしは、まだ決められません。もう少し、言葉を聞きたいです。',
};

function voteLine(seat: SeatId, target: string): string {
  switch (seat) {
    case 'seat-1': return `うーん、今は${target}へ入れようと思います。間違っていたら怖いですけど……。`;
    case 'seat-2': return `うちは${target}に入れるで！ やっぱ今の感じ、なんでやねん！`;
    case 'seat-3': return `私は${target}に入れようかな。ごめんね、でも今はそこが一番気になる。`;
    case 'seat-4': return `すみません……私は${target}に入れます。考えたのですが、違和感が消えません。`;
    case 'seat-5': return `私は${target}に入れる。反論があるなら、逃げずに言って。`;
    case 'seat-6': return `${target}に入れる。以上。`;
    case 'seat-7': return `俺は${target}に入れる！ ここは逃げちゃ駄目だ！`;
    case 'seat-8': return `わしは${target}に入れるぞい。笑ってごまかしたところが、どうも引っかかるでの。`;
    case 'seat-9': return `あの……わたしは${target}に入れます。これ以上、見過ごせません。`;
  }
}

function boardLine(seat: SeatId): string {
  switch (seat) {
    case 'seat-1': return '役職の人だけで決めず、置いていかれた人の話も聞きたいです。';
    case 'seat-2': return '役職の人ばっか見るん？ なんでやねん、うちはほかも気になるで！';
    case 'seat-3': return '役職の人たちも気になるけど、ほかのみんなは誰を見てるのかな。';
    case 'seat-4': return 'すみません……役職の話だけで決めていいのか、まだ不安です。';
    case 'seat-5': return '役職の数だけ見て満足しないで。黙って安全にいる人も私は見る。';
    case 'seat-6': return '役職だけ見るな。票も見ろ。';
    case 'seat-7': return '役職だけで決めるのは違うだろ！ ほかのやつも腹を割れ！';
    case 'seat-8': return 'ほっほ、役職候補ばかり見とったら、灰に笑われるぞい。ほかの連中も見ようかの。';
    case 'seat-9': return 'あの……役職の人だけを見ていると、その外が静かすぎて、怖いです。';
  }
}

function suspicionLine(seat: SeatId, target: string): string {
  switch (seat) {
    case 'seat-1': return `うーん、${target}のことが少し心配です。責めたいわけじゃないんですけど……。`;
    case 'seat-2': return `ほんま？ ${target}、今の返しはなんでやねん！ うちは気になるで！`;
    case 'seat-3': return `私、${target}がちょっと気になるかな。もう少し気持ちを聞きたいな。`;
    case 'seat-4': return `すみません……私の勘違いかもしれませんが、${target}が気になります。`;
    case 'seat-5': return `私は${target}を疑う。違うなら、こっちを納得させて。`;
    case 'seat-6': return `${target}が怪しい。俺は外さん。`;
    case 'seat-7': return `俺は${target}を疑う！ 今のままじゃ信じられない！`;
    case 'seat-8': return `ほっほ、今は${target}が気になるのう。わしの軽口への返し、ちとかたすぎやせんか。`;
    case 'seat-9': return `あの……${target}が、気になります。うまく言えないけど……怖いです。`;
  }
}

export class MockAI implements DecisionProvider {
  async speech(context: DecisionContext): Promise<SpeechDecision> {
    const profile = characterForSeat(context.characters, context.actor.seat);
    const defaultProfile = DEFAULT_CHARACTER_ROSTER.find((candidate) => candidate.name === profile.name);
    const customized = !defaultProfile || profile.exampleLine !== defaultProfile.exampleLine || profile.firstPerson !== defaultProfile.firstPerson;
    const rosterCustomized = Boolean(context.characters?.some(
      (character) => !DEFAULT_CHARACTER_ROSTER.some((candidate) => candidate.name === character.name),
    ));
    const personaSeat = defaultProfile?.seat ?? context.actor.seat;
    const address = (seat: SeatId) => characterAddressTerm(context.characters, context.actor.seat, seat);
    if (context.kind === 'speech' && context.claimDirective) {
      const directive = context.claimDirective;
      if (directive.mode !== 'forbidden' && directive.claimedRole) {
        const roleLabel = directive.claimedRole === 'seer' ? '占い師' : '霊媒師';
        const resultSpeech = directive.results.map((result) => {
          const verdict = result.verdict === '人狼' ? '人狼でした' : '人狼ではありませんでした';
          return `${result.day}日目の${address(result.targetSeat)}は${verdict}`;
        }).join('。');
        const roleClaim = characterRoleClaimSentence(context.characters, context.actor.seat, roleLabel);
        const speech = `${roleClaim}。${resultSpeech || '今は伝えられる結果はありません。'}`;
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
    const candidates = customized
      ? [profile.exampleLine]
      : rosterCustomized
        ? [`${profile.firstPerson}は、公開された発言と投票を見て判断します。気になる点は本人に確認します。`]
        : observations[personaSeat] ?? ['公開情報をもう一度確認します。'];
    const index = stableIndex(context.seed, context.callKey, candidates.length);
    const prefix = context.wolfChat?.mode === 'monologue'
      ? '……もう相談相手はいない。次の襲撃を自分で決めるなら、'
      : context.kind === 'wolf_speech' ? '襲撃方針として、' : '';
    const speech = `${prefix}${candidates[index]}`;
    const addressedTo = Object.entries(profile.addressBook)
      .find(([seat, term]) => context.legalTargets.includes(seat as SeatId) && speech.includes(term ?? ''))?.[0] as SeatId | undefined;
    const structureTarget = context.players.filter((player) => player.alive && player.seat !== context.actor.seat)[
      stableIndex(context.seed, `${context.callKey}-structure-target`, context.players.filter((player) => player.alive && player.seat !== context.actor.seat).length)
    ]?.seat ?? null;
    const v3 = context.discussion?.version === 'v3';
    const answering = Boolean(context.discussion?.promptedBySeat);
    const scarce = v3 && context.discussion?.materialPhase === 'scarce' && !answering;
    const shouldDeclareVote = v3 && (context.discussion?.turn ?? 0) >= 10 && Boolean(structureTarget);
    const shouldAnalyzeBoard = v3 && !scarce && !shouldDeclareVote && (context.discussion?.turn ?? 0) % 4 === 0;
    const mockSuspicionBases = ['speech_content', 'statement_slip', 'reasoning_quality'] as const;
    const suspicionBasis = mockSuspicionBases[
      stableIndex(context.seed, `${context.callKey}-suspicion-basis`, mockSuspicionBases.length)
    ];
    const finalSpeech = scarce
      ? scarceLines[personaSeat]
      : shouldDeclareVote
      ? customized ? `${profile.firstPerson}は${address(structureTarget!)}へ投票します。` : voteLine(personaSeat, address(structureTarget!))
      : shouldAnalyzeBoard
        ? boardLine(personaSeat)
        : v3 && structureTarget
          ? customized ? `${profile.firstPerson}は${address(structureTarget)}が気になります。` : suspicionLine(personaSeat, address(structureTarget))
          : speech;
    const decision: SpeechDecision = {
      speech: finalSpeech.slice(0, 200),
      addressedTo: addressedTo ?? null,
      requestsReply: context.wolfChat?.mode === 'monologue' || context.discussion?.canRequestReply === false
        ? false
        : Boolean(addressedTo && /[?？]|教えて|答えて|聞かせ|聞きたい|聞いてみたい/.test(speech)),
    };
    if (v3) {
      decision.structure = {
        primaryAct: answering ? 'answer' : scarce ? 'other' : shouldDeclareVote ? 'vote_intent' : shouldAnalyzeBoard ? 'board_analysis' : 'suspicion',
        questionTopic: answering || decision.requestsReply ? 'other' : null,
        suspicion: !answering && !scarce && !shouldDeclareVote && !shouldAnalyzeBoard && structureTarget
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
