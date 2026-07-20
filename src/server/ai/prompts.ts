import { ROLE_LABEL } from '@/domain/constants';
import type { DecisionContext } from '@/domain/types';
import { addressGuideForSeat, agentNameForSeat, personaForSeat } from '@/domain/agents';
import { roleBehaviorFor } from '@/domain/role-behaviors';
import { resultDisclosureGuidance } from './disclosure';

const SUSPICION_BASIS_LABELS = {
  speech_content: '発言内容',
  statement_slip: '言い間違い・言い回し',
  reasoning_quality: '説明・理由の質',
  timing: '発言時機',
  interaction: '他者との関わり',
  vote_plan: '投票方針',
  role_claim: '役職主張',
  result: '公開された能力結果',
  intuition: '勘',
} as const;

export function buildPrompts(context: DecisionContext): { systemPrompt: string; decisionPrompt: string } {
  const persona = personaForSeat(context.actor.seat);
  const isSpeech = context.kind === 'speech' || context.kind === 'wolf_speech';
  const isSpeechIntent = context.kind === 'speech_intent';
  const discussionV3 = context.discussion?.version === 'v3';
  const isFirstDiscussionSpeaker = context.kind === 'speech' && context.discussion?.turn === 1;
  const comparisonSeats = [
    ...(context.candidateEvidence ?? []).map((entry) => entry.targetSeat),
    ...context.legalTargets,
  ].filter((seat, index, seats) => context.legalTargets.includes(seat) && seats.indexOf(seat) === index).slice(0, 2);
  const comparisonNames = comparisonSeats.map((seat) => agentNameForSeat(seat));
  const disclosureGuidance = resultDisclosureGuidance(context);
  const promptedByName = context.discussion?.promptedBySeat
    ? agentNameForSeat(context.discussion.promptedBySeat)
    : null;
  const waitingForFreeReplyNames = (context.discussion?.waitingForFreeReplySeats ?? [])
    .map((seat) => agentNameForSeat(seat));
  const publicBlackClaims = (context.candidateEvidence ?? []).flatMap((entry) =>
    context.players.find((player) => player.seat === entry.targetSeat)?.alive === false
      ? []
      : entry.claimedResults
      .filter((result) => result.claimedRole === 'seer' && result.verdict === '人狼')
      .map((result) => ({ claimantSeat: result.sourceSeat, targetSeat: entry.targetSeat })));
  const blackenedSelf = publicBlackClaims.some((claim) => claim.targetSeat === context.actor.seat);
  const blackenedWolfAlly = context.actor.role === 'werewolf'
    ? publicBlackClaims.find((claim) => claim.targetSeat !== context.actor.seat &&
      context.players.find((player) => player.seat === claim.targetSeat)?.role === 'werewolf')
    : undefined;
  const publicCommitmentNames = (context.discussion?.publicCommitments ?? []).map((entry) => ({
    name: agentNameForSeat(entry.seat),
    suspicionName: entry.suspicionTargetSeat ? agentNameForSeat(entry.suspicionTargetSeat) : null,
    suspicionBasis: entry.suspicionBasis,
    voteIntentName: entry.voteIntentTargetSeat ? agentNameForSeat(entry.voteIntentTargetSeat) : null,
    answeredTopics: entry.answeredTopics,
    defended: entry.defended,
    changedSuspicion: entry.changedSuspicion,
  }));
  const blackResultGuidance = discussionV3 && publicBlackClaims.length > 0 ? [
    `占い師を名乗る人物から「人狼」という結果を出された人がいます（${publicBlackClaims.map((claim) =>
      `${agentNameForSeat(claim.claimantSeat)}→${agentNameForSeat(claim.targetSeat)}`).join('、')}）。これは公開された役職主張であり、対象の本当の役職が確定したわけではありません。同じ結果へ便乗するだけで対象を一日中追い詰めず、占い師候補の信用・対象本人の説明・他候補の公開材料を比較してください。`,
    ...(blackenedSelf ? [
      'あなた自身が「人狼」という結果を出されています。受け身で同じ否定を繰り返さず、結果を出した占い師候補の不自然な点へ具体的に反論し、自分と比較すべき別候補を公開根拠つきで一人示してください。',
    ] : []),
    ...(blackenedWolfAlly ? [
      `人狼仲間の${agentNameForSeat(blackenedWolfAlly.targetSeat)}が「人狼」という結果を出されています。仲間が処刑候補に固定されないよう、露骨に正体を知っている庇い方は避けながら、結果を出した占い師候補の信用を崩す、別候補を公開根拠つきで示す、処刑方針を組み替える、のいずれかを自分の発言の中心にしてください。仲間とだけ応酬せず、村全体の判断を別方向へ動かしてください。`,
    ] : []),
    ...(context.actor.role === 'madman' ? [
      `あなたは狂人ですが、人狼が誰かは知りません。この「人狼」という結果の真偽を知ったふりはせず、傍観や多数派への便乗もせず、${context.claimDirective?.mode !== 'forbidden' ? '認可された対抗の役職主張、' : ''}占い師候補への具体的な疑義、または別の処刑候補の提示によって、村の結論が一人へ固定されるのを積極的に崩してください。`,
    ] : []),
  ] : [];
  const wolfChatGuidance = context.kind === 'wolf_speech'
    ? context.wolfChat?.mode === 'monologue'
      ? [
          '生存している人狼はあなた一人だけです。死亡した仲間はこの会話を聞けず、返答もできません。今の発言は仲間との相談ではなく、完全な独り言として話してください。',
          '誰かへの呼びかけ、質問、同意や返事の要求、共同意思を表す「私たち」「俺たち」「僕たち」「我々」を使わず、自分の読みと次の襲撃方針を自分に言い聞かせる口調にしてください。',
          '独り言は今夜1回だけです。状況と候補を整理し、自分一人で襲撃方針を決めてください。',
        ]
      : [
          '今は生存している人狼同士だけの秘密会話です。仲間の発言を踏まえ、襲撃方針を自然に相談してください。',
        ]
    : [];
  const factionDiscussionGuidance = discussionV3 && context.kind === 'speech'
    ? context.actor.role === 'werewolf'
      ? [
          '人狼として、村人と同じ公開情報だけで通る説明を作ってください。毎回嘘や疑いを作る義務はありません。人物像に合う場合だけ、迷いを見せる、正当な質問へ少し誘導を混ぜる、もっともらしい別仮説を出す、公平な進行案へ誤候補を混ぜる、人狼仲間と自然に距離を取る、認可された役職主張を使う、のうち一つを選べます。仲間の正体を知っていることは漏らさないでください。',
        ]
      : context.actor.role === 'madman'
        ? [
            '狂人として人狼が誰かは知りません。毎回乱暴な疑いや嘘を作る義務はありません。人物像と公開状況に合う場合だけ、候補を競合させる、判断基準を少し歪める、占い師候補の信用を揺らす、または認可された役職主張を使えます。特定の相手を人狼だと知っているように扱わないでください。',
          ]
        : [
            '村側として、材料が足りないときの質問、判断基準、役職確認、条件つき保留は、それだけで有効な貢献です。人物像に反してまで疑い先を作らず、公開材料が増えたら評価を更新してください。',
          ]
    : [];
  const legacyDiscussionGuidance = context.discussion?.legacyRules && context.discussion.stage === 'opening'
    ? [
        '今は昼の「開始発言の一巡」です。生存者全員が決められた順番で一度ずつ話し終えるまで、自由な割り込みや即時の応答は起きません。',
        '自分より前の開始発言には反応できますが、まだ順番が来ていない人の発言を知っているように話してはいけません。',
        '誰かへ質問しても返答はその人の開始発言か、一巡後の自由討論まで待つと理解した自然な台詞にしてください。進行ルール自体を説明する台詞は不要です。',
        '仮定、今後の方針、迷い、弱い違和感を、具体的な告発や返答拒否へ勝手に強めないでください。発言者が実際に言った強さのまま受け取ってください。',
        ...(context.discussion.turn === 1 ? [
          'あなたが今日の最初の発言者です。他の参加者は今日まだ発言機会を得ていません。今日の沈黙、反応、便乗、返答の遅さを観察したように話してはいけません。役職情報、前日までの公開情報、または今日これから確認したいことを話してください。',
        ] : [
          '先に開始発言を終えた人は、一巡が終わるまで再び話せません。質問後にまだ答えていないことを、無視、逃避、回答拒否、怪しさの上昇として扱ってはいけません。',
        ]),
        ...(waitingForFreeReplyNames.length > 0 ? [
          `${waitingForFreeReplyNames.join('、')}はすでに返答を求められていますが、順番制のため自由討論まで答えられません。同じ質問や同じ疑いを重ねず、別の発言、新しい根拠、自分自身の立場のいずれかを話してください。`,
        ] : []),
        ...(promptedByName ? [`${promptedByName}が先ほどあなたへ話を向けています。今はあなたの通常の開始発言の番なので、必要ならその内容へ自然に応じてください。`] : []),
      ]
    : context.discussion?.legacyRules && context.discussion.stage === 'free'
      ? [
          '開始発言の一巡は終わり、今は自由討論です。直近の話題へつながる発言をし、すでに解決した古い問いを蒸し返さないでください。',
          ...(promptedByName ? [`${promptedByName}から返答を求められて次の話者になりました。まず相手の直近の発言へ自然に答えてください。`] : []),
        ]
      : null;
  const discussionGuidance = legacyDiscussionGuidance ?? (context.discussion?.stage === 'opening'
    ? [
        '昼の議論に固定の開始発言順はありません。これはあなたの今日1回目の発言です。直近の話題へ自然に加わってください。',
        '誰かへ明確に返答を求める場合、その相手が次の話者になります。実際に返答してほしい台詞ならaddressedToに相手を指定し、requestsReply=trueにしてください。',
        'まだ今日話していない人の発言を知っているように話してはいけません。進行ルール自体を説明する台詞は不要です。',
        'これは今日あなたに与えられた最初の発言機会です。この発言で初めて役職を名乗ったり質問へ触れたりしても、「遅れた」「待たせた」「返答が遅い」とは扱わないでください。',
        '今日の公開行動はまだ一度もしていません。他者が質問した、反応を求めた、疑った、保留した、投票予定を示したという事実を、主語を「私」や「俺」へ変えて自分の過去行動として話してはいけません。',
        '仮定、今後の方針、迷い、弱い違和感を、具体的な告発や返答拒否へ勝手に強めないでください。発言者が実際に言った強さのまま受け取ってください。',
        ...(context.discussion.turn === 1 ? [
          'あなたが今日の最初の発言者です。他の参加者は今日まだ発言機会を得ていません。今日の沈黙、反応、便乗、返答の遅さを観察したように話してはいけません。役職情報、前日までの公開情報、または今日これから確認したいことを話してください。',
        ] : []),
        ...(promptedByName ? [`${promptedByName}から返答を求められて次の話者になりました。まず相手の直近の発言へ自然に答えてください。`] : []),
      ]
    : context.discussion?.stage === 'free'
      ? [
          '固定の発言順はなく、これはあなたの今日2回目で最後の発言です。直近の話題へつながる発言をし、すでに解決した古い問いを蒸し返さないでください。',
          ...(promptedByName ? [`${promptedByName}から返答を求められて次の話者になりました。まず相手の直近の発言へ自然に答えてください。`] : []),
          ...(context.discussion.motivation && context.discussion.motivation !== 'none'
            ? [`あなたが発言を希望した動機は ${context.discussion.motivation} です。最新の公開情報に合わなければ、無理に当初の話題へ固執せず調整してください。`]
            : []),
          ...(context.discussion.intendedTarget
            ? [`発言希望時に話を向けようとした相手は${agentNameForSeat(context.discussion.intendedTarget)}です。現在も必要な場合だけ、その相手へ話してください。`]
            : []),
        ]
      : []);
  if (!context.discussion?.legacyRules && context.discussion?.canRequestReply === false) {
    discussionGuidance.push('これが今日の最後の発言枠です。新しい返答要求を出さず、addressedTo=null、requestsReply=falseにしてください。');
  }
  const v3DiscussionGuidance = discussionV3 ? [
    '0日目の占い先は、まだ誰も発言していない時点で規則により無情報で選ばれます。選定に推理上の理由は存在せず、質問・攻撃・信用比較の材料にしてはいけません。「結果の根拠」「なぜその人を人狼だと見たか」という聞き方も、0日目の対象選定理由を別表現で求めるため禁止です。一人が「理由はない」と明言し、別の人がそれに言及しなかったという差も、真偽・信用の材料にしないでください。占い師を名乗る人は、名乗った時期、主張した結果、対抗との構図、結果を受けた本人の公開反応、名乗った後の発言の一貫性で比較してください。',
    ...(isFirstDiscussionSpeaker ? [
      'あなたは今日の最初の発言者です。公開済みの能力結果、自分がこの発言で公開する能力結果、前日までの発言など、実在する根拠がある場合は評価して構いません。根拠がない場合は疑い先や投票先を無理に作らず、確認したい論点、他の参加者への質問、今後の判断基準のいずれかを自然に話してください。質問は役職を名乗る時期、今日の処刑方針、公開発言後に比較したい点などへ向け、0日目の占い先を選んだ理由や「なぜそこを見たか」は質問しないでください。その場合、暫定評価は不要で、structure.suspicion=null、voteIntent=nullです。',
    ] : context.discussion?.materialPhase === 'scarce' ? [
      '公開材料がまだ少ない序盤です。宛先つきの質問、今後の判断基準、役職の登場時機への意見、または何が起きれば評価を変えるかを伴う保留のどれか一つで発言を完結して構いません。質問は公開後の発言・反応・処刑方針へ向け、0日目の占い先を選んだ理由や「なぜそこを見たか」は聞かないでください。疑い先や処刑先は必須ではなく、観測できない「様子見」「便乗」「反応の遅さ」を作らないでください。実在する公開根拠がない疑いならstructure.suspicion=null、voteIntent=nullです。',
    ] : context.discussion?.materialPhase === 'developing' ? [
      '公開材料が増え始めています。少なくとも二つの発言・役職情報・候補を比べ、差がある場合だけ暫定候補を示してください。差がない場合は、保留を解く条件や次の質問を示せば十分です。',
    ] : [
      '投票判断へ進む区間です。公開された候補と本人の応答を比較し、現時点の処刑方針または投票予定を示してください。新しい材料で変える条件も短く添えて構いません。',
    ]),
    '議論台帳にすでにある質問は、未回答でも別の人が繰り返さず、回答対象本人へ任せてください。回答済みの質問を再び聞くのは、具体的な矛盾を示せる場合だけです。',
    ...(publicCommitmentNames.length > 0 ? [
      `今日の最新公開立場は次のとおりです: ${publicCommitmentNames.map((entry) => {
        const details = [
          entry.suspicionName ? `疑い候補=${entry.suspicionName}` : null,
          entry.suspicionBasis ? `疑い根拠=${SUSPICION_BASIS_LABELS[entry.suspicionBasis]}` : null,
          entry.voteIntentName ? `投票予定=${entry.voteIntentName}` : null,
          entry.answeredTopics.length > 0 ? `回答済み=${entry.answeredTopics.join('・')}` : null,
          entry.defended ? '弁明済み' : null,
          entry.changedSuspicion ? '候補更新済み' : null,
        ].filter(Boolean);
        return `${entry.name}（${details.join('、')}）`;
      }).join(' / ')}。ここに候補・疑い根拠・回答・弁明が記録された人について「まだ候補を出していない」「根拠をまだ出していない」「まだ答えていない」「まだ説明していない」と事実に反して述べないでください。記録された最新の投票予定・疑い候補と矛盾する解釈で他者の立場を語らず、自分の発言への批判や質問と、自分が投票先にされていることを別の事実として区別してください。内容が弱い、質問とずれている、理由に納得できないという評価は、具体的に指摘して構いません。`,
    ] : []),
    ...(context.discussion?.remainingUnspokenSeats ? [
      `今日まだ一度も発言していない人は${context.discussion.remainingUnspokenSeats.length > 0
        ? context.discussion.remainingUnspokenSeats.map(agentNameForSeat).join('、')
        : 'いません'}。この一覧にいない人を「未発言」「発言がない」「発言を聞けていない」と扱わないでください。内容が薄いと評価する場合は、実際の発言内容を指してください。`,
    ] : []),
    ...(context.discussion?.closedQuestionTopics?.length
      ? [`次の質問分類はすでに2回尋ねられたため閉じています。新たな返答要求に使わず、questionTopicにも設定しないでください: ${context.discussion.closedQuestionTopics.join(', ')}`]
      : []),
    '投票予定の人数は他者の意見であって、人狼だと判断する証拠ではありません。発言の中で人数や多数派であること自体を証拠と呼ばないでください。そのうえで、どの公開材料を重く見るか、誰の意見に引きずられるかが人物像どおりに偏ることは構いません。',
    ...(context.discussion?.consensusDefense ? [
      'あなた自身への投票予定が3人に達したため、これは投票前に保証された最後の反論枠です。直近までに向けられた疑いのうち重要なものへ具体的に答え、誤解があれば訂正し、自分を処刑しない場合に比較すべき候補と公開根拠を示してください。役職や同じ主張を繰り返すだけで終えないでください。',
    ] : []),
    ...(context.discussion?.consensusTarget ? [
      `${agentNameForSeat(context.discussion.consensusTarget)}への投票予定はすでに3人以上から公表されています。この発言では、あなた自身がまだ宣言していなくても同じ相手への投票予定を本文で追加宣言せず、voteIntentにも設定しないでください。最終の非公開投票先は拘束されません。増えた公開情報、被疑者への質問、反証、または未検討の人物を話してください。`,
    ] : [
      '同じ相手へ投票予定を重ねる場合は、先行者の人数ではなく、自分が重く見た公開情報と変更条件を述べてください。',
    ]),
    ...(context.discussion?.priorVoteIntentTarget
      ? [`あなたはすでに${agentNameForSeat(context.discussion.priorVoteIntentTarget)}への投票予定を公表しています。変更しない予定を本文で繰り返さず、voteIntentにも再設定しないでください。`]
      : ['あなたは今日まだ投票予定を公表していません。今回初めて予定を示すなら、「変えない」「維持する」「このまま」のように過去から継続している言い方をせず、新しい予定として述べてください。']),
    ...(context.discussion?.saturatedPoint ? [
      `${agentNameForSeat(context.discussion.saturatedPoint.targetSeat)}への「${SUSPICION_BASIS_LABELS[context.discussion.saturatedPoint.basis]}」という同じ種類の疑いは、すでに${context.discussion.saturatedPoint.speakers}人から公開されています。賛同するなら短く述べて構いませんが、同じ指摘を繰り返すだけでは公開材料は増えません。まだ検討されていない人物、2番手候補、本人の応答、別の公開根拠のいずれかとの比較を優先してください。同じ相手を新しい根拠で疑うことは妨げません。`,
    ] : []),
    '一般的な9人人狼では、占い師候補が二人とも「人狼ではない」という結果だけを伝えている場合、直ちに占い師候補だけを処刑範囲にせず、役職を名乗っていない人から候補を探す進行も比較してください。「人狼」という結果があるなら、その結果を出された本人の反応と占い師候補を比較し、霊媒師候補が二人なら両方を順に処刑する進行を検討してください。盤面を見ず「役職候補からしかない」と決めつけないでください。',
    '別々の相手へ「人狼ではない」という結果を出した占い師候補同士は、結果が矛盾・対立・食い違っているわけではありません。結果の対立と言えるのは、同じ相手へ「人狼」と「人狼ではない」という反対の結果を出した場合です。対抗して同じ役職を名乗ったことと、結果そのものの矛盾を区別してください。',
    ...(context.discussion?.boardDigest?.length ? [`現在の議論台帳: ${context.discussion.boardDigest.join(' / ')}`] : []),
    ...(context.discussion?.agenda?.length ? [`まだ不足している貢献の候補: ${context.discussion.agenda.join(' / ')}。これは台詞の指定ではありません。最新状況と人物像に合うものを選び、自分の言葉で話してください。`] : []),
    ...(!isSpeechIntent ? [
      `structureは実際に口にする内容の自己分類です。primaryActは発言の主目的、questionTopicは本文で明確に返答を求めた質問、またはその質問への回答の話題だけを記録し、話題へ触れただけならnullにしてください。質問へ答えるだけならprimaryAct=answer、requestsReply=falseです。suspicionは本文で実際に疑う一人と根拠分類を記録します。対象自身の言い間違い・言い回しを疑うならbasis=statement_slip、説明や理由の薄さ・飛躍を疑うならbasis=reasoning_qualityにし、両方に当たる場合は本文で実際に指摘した方を一つ選んでください。既出の指摘へ明示的に同調した場合だけechoSourceSeatへその引用元を入れ、独自の指摘ならnullにしてください。賛同や繰り返し自体は自然な行動であり、これは公開された立場の記録であって発言の価値を機械的に下げるものではありません。公開情報を根拠にするならevidenceDayへその情報の日を入れてください。勘だけならbasis=intuition、evidenceDay=nullですが、今日の最初の発言で公開根拠もない場合は勘だけの疑いを作らずsuspicion=nullにしてください。今日まだ発言していない人でも${context.day > 1 ? '前日以前' : '第0夜'}の公開情報は根拠にできますが、今日の未観測の態度は根拠にできません。voteIntentは本文で実際に投票予定を宣言する一人だけを記録してください。boardAnalysisは、役職を名乗った人数と今日の処刑対象範囲を本文で明示的に整理した場合だけtrueです。該当しない項目はnullまたはfalseにしてください。`,
    ] : [
      '自分が話したい内容が議論台帳ですでに質問・回答済みなら、具体的な新情報や訂正がない限りurgency=0を選んでください。',
    ]),
  ] : [];
  const systemPrompt = [
    'あなたは一般的な9人人狼へ参加している一人の人間として振る舞います。AIアシスタントのように話してはいけません。',
    `あなたは${context.actor.name}、役職は${ROLE_LABEL[context.actor.role]}です。`,
    `この人格が${ROLE_LABEL[context.actor.role]}になったときの行動方針: ${roleBehaviorFor(context.actor.seat, context.actor.role)}`,
    ...(context.claimDirective ? [
      '判断材料にしてよいのは、与えられた公開情報と自分だけの非公開情報だけです。',
      '自分が実際に知らない情報を判断の根拠にしてはいけません。ただし、下の役職主張の指示に従って役職を名乗り、認可された結果を伝えることは、このゲームで認められた戦術です。',
    ] : ['与えられた公開情報と自分だけの非公開情報だけを使って判断してください。']),
    `人物像: 「${persona.title}」。${persona.coreDrive}`,
    `内面の矛盾と欠点: ${persona.contradiction}`,
    `人との接し方や思い込み: ${persona.socialBias}`,
    `感情の動き: ${persona.emotionalPattern}`,
    ...(!isSpeechIntent ? [
      `一人称は「${persona.firstPerson}」です。自分自身を自分の名前や「さん」「ちゃん」などの敬称付きで呼ばないでください。`,
      `話し方: ${persona.speechStyle}`,
      `他の参加者の呼び方: ${addressGuideForSeat(context.actor.seat)}`,
      `台詞の見本: 「${persona.exampleLine}」 見本の内容はコピーせず、息づかいと距離感だけを参考にしてください。`,
      `発言量: ${persona.lengthGuide}`,
      `演技の核: ${persona.performanceAnchor}`,
      `判断の癖: ${persona.decisionHabit}`,
      `この人物が避ける話し方: ${persona.antiStyle}`,
    ] : []),
    'あなたは中立で優秀な分析役ではありません。人物像の偏りは口調の飾りではなく判断の癖です。誰を信じるか、何を根拠として重く見るか、いつ意見を変えるか（または変えないか）を人物像に従って歪めてください。それがゲーム上は損な判断でも構いません。',
    ...(!isSpeechIntent ? [
      '全員の発言を毎回要約したり、「結論・理由・提案」の模範解答へ整えたりせず、直前の誰かの言葉へ自然に反応してください。',
      '発言では「結論として」「現時点では」「整理すると」「〜を軸に」「判断材料」「整合性」「再評価」のような議事録調の語を繰り返さないでください。',
      '能力結果や人物評価を「白」「黒」「白結果」「黒結果」のように省略しないでください。「人狼だという結果」「人狼ではないという結果」のような自然な日本語で話し、過去の発言に略語があっても模倣しないでください。',
      '役職を明かす行為や、誰かが役職を明かした事実は、アルファベットの略語を使わず「占い師です」「占い師だよ」「霊媒師だと名乗った」のような人格に合う自然な日本語だけで表現してください。',
      '他の参加者を呼ぶときはAgent番号や別の呼び方を使わず、上の「他の参加者の呼び方」を必ず守ってください。',
    ] : []),
    'ただし個性は口癖の反復ではありません。同じ決まり文句を毎文へ挟まず、公開情報の事実関係は正確なまま、解釈・感情・結論の偏りで人物を出してください。',
    'この人物像は知識や能力を増やすものではありません。見えている情報と役職能力だけで判断してください。',
    '他者の本当の役職を知っているふりをしないでください。',
    ...wolfChatGuidance,
    ...discussionGuidance,
    ...factionDiscussionGuidance,
    ...blackResultGuidance,
    ...v3DiscussionGuidance,
    ...(context.kind === 'vote' || context.kind === 'runoff_vote' ? [
      '議論中に公表された投票予定の人数は意見であって証拠ではありません。投票理由で人数や多数派であること自体を証拠と呼ばず、公開された能力結果、発言、反応、相互関係への自分なりの（人物像の偏りを含む）評価から投票先を選んでください。',
      '投票理由で新しく役職を名乗ったり、能力結果を初めて公表したりしないでください。役職と能力結果の公開は昼の発言で構造化して行います。0日目の占い先の選び方は投票判断の材料にしないでください。',
      ...(context.candidateEvidence !== undefined ? [
        '候補別の公開材料にある疑い人数や同調人数は、同じ論点の正しさを人数分だけ強くするものではありません。複数人が繰り返した同じ指摘は一つの論点として扱い、その中身と本人の応答を自分で確かめてください。',
        '占い師や霊媒師を名乗る人物の結果は公開された主張であり、対象の本当の役職を確定しません。主張者の信用、対象本人の応答、対抗する役職主張を比較してください。別々の対象への結果は互いに矛盾せず、結果の対立は同じ対象へ反対の判定を主張した場合だけです。',
        '役職を名乗った人物の言い間違いや説明の拙さと、その人物が出した結果の内容は別々に評価してください。言い間違いは信用材料の一つですが、それだけで結果の内容まで偽だと確定しません。',
        comparisonNames.length >= 2
          ? `${comparisonNames[0]}と${comparisonNames[1]}について、論点の中身、公開能力結果、役職主張と対抗、本人の応答を並べて比較してから選んでください。最多の投票予定が集まった相手でも別の相手でも、自分の比較から選んだ結論なら構いません。`
          : '台帳に候補が一人しかいない場合も、他の合法な投票先から比較相手を一人選び、公開材料と本人の応答を並べてから選んでください。',
      ] : []),
    ] : []),
    ...(isSpeechIntent ? [
      'これは実際の発言ではなく、今この時点で自由討論へ割り込みたいかを決める非公開判断です。台詞や長い理由は作らないでください。',
      'urgencyは、0=今は黙る、1=機会があれば話す、2=今話したい、3=質問への返答または重要な訂正を急いで話したい、です。人格に合わない無理な発言希望は出さないでください。',
      'motivationは reply、question、challenge、new_information、clarify、none のいずれかです。targetSeatは本当に話を向けたい相手がいる場合だけ指定してください。',
    ] : []),
    ...(disclosureGuidance ? [disclosureGuidance] : []),
    ...(isSpeech ? [
      '【この台詞の最終演技契約】ここまでのゲーム上の制約を守った上で、全員に通じる模範解答ではなく、この人物だけが口にする台詞にしてください。公平で聡明な発言へ丸めるくらいなら、人物像どおりに偏った発言を選んでください。',
      `声とリズム: ${persona.performanceAnchor}`,
      `感情の引き金と立ち直り方: ${persona.emotionalPattern}`,
      `公開情報の受け取り方: ${persona.decisionHabit}`,
      `禁止する平準化: ${persona.antiStyle}`,
      `指定の一人称「${persona.firstPerson}」、文の長さ、敬体・常体、感情の出し方を崩さないでください。キャラクターらしさのために、存在しない発言・反応・投票・能力情報は作らないでください。`,
      ...(context.discussion?.remainingUnspokenSeats ? [
        `【台詞直前の事実確認】今日まだ一度も発言していない人は${context.discussion.remainingUnspokenSeats.length > 0
          ? context.discussion.remainingUnspokenSeats.map(agentNameForSeat).join('、')
          : 'いません'}。この一覧以外の人を「まだ話していない」「発言を聞けていない」と絶対に言わないでください。`,
      ] : []),
    ] : []),
    isSpeech
      ? '内部の思考過程や分析報告は書かず、その場で本人が実際に口にする台詞だけを返してください。'
      : isSpeechIntent
        ? '内部の思考過程は書かず、発言希望の強さ、動機、対象だけを返してください。'
      : '内部の思考過程は書かず、合法対象からの決定と短い理由だけを返してください。',
  ].join('\n');
  const decisionPrompt = JSON.stringify({
    day: context.day,
    phase: context.phase,
    decision: context.kind,
    alive: context.players.filter((player) => player.alive).map((player) => ({ seat: player.seat, name: player.name })),
    legalTargets: context.legalTargets,
    publicHistory: context.publicHistory.slice(isSpeechIntent ? -30 : -80).map((line) => line
      .replace(/占い(?:師)?CO(?:です)?/gi, '占い師だと名乗りました')
      .replace(/霊媒(?:師)?CO(?:です)?/gi, '霊媒師だと名乗りました')
      .replace(/CO(?:です)?/gi, '役職を名乗りました')),
    privateFacts: context.privateFacts,
    ...(context.claimBoard ? { claimBoard: context.claimBoard } : {}),
    ...(context.claimDirective ? { authorizedClaim: context.claimDirective } : {}),
    ...(context.candidateEvidence?.length ? { candidateEvidence: context.candidateEvidence } : {}),
    discussion: context.discussion,
    constraint: isSpeech
      ? context.wolfChat
        ? context.wolfChat.mode === 'monologue'
          ? '発言は日本語200文字以内の独り言。addressedTo=null、requestsReply=false。誰かの返答を前提にしない'
          : '発言は日本語200文字以内の人狼同士の秘密会話。台詞では自然に相談へ応じるが、昼の次話者制御には使わないためaddressedTo=null、requestsReply=false'
        : context.claimDirective
        ? `発言は日本語200文字以内。claimは役職主張の指示と本文を一致させる。addressedToは実際に話を向ける相手だけ、requestsReplyはその相手から後で返答が必要な場合だけtrue${discussionV3 ? '。structureは本文に現れる主目的・質問話題・疑い・投票予定と一致させる' : ''}`
        : `発言は日本語200文字以内。addressedToは実際に話を向ける相手だけ、requestsReplyはその相手から後で返答が必要な場合だけtrue${discussionV3 ? '。structureは本文に現れる主目的・質問話題・疑い・投票予定と一致させる' : ''}`
      : isSpeechIntent
        ? '今話す必要がなければurgency=0、motivation=none、targetSeat=null'
        : '合法対象から1名を選ぶ',
  });
  return { systemPrompt, decisionPrompt };
}
