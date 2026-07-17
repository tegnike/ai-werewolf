import { ROLE_LABEL } from '@/domain/constants';
import type { DecisionContext } from '@/domain/types';
import { addressGuideForSeat, agentNameForSeat, personaForSeat } from '@/domain/agents';
import { roleBehaviorFor } from '@/domain/role-behaviors';
import { resultDisclosureGuidance } from './disclosure';

export function buildPrompts(context: DecisionContext): { systemPrompt: string; decisionPrompt: string } {
  const persona = personaForSeat(context.actor.seat);
  const isSpeech = context.kind === 'speech' || context.kind === 'wolf_speech';
  const isSpeechIntent = context.kind === 'speech_intent';
  const disclosureGuidance = resultDisclosureGuidance(context);
  const promptedByName = context.discussion?.promptedBySeat
    ? agentNameForSeat(context.discussion.promptedBySeat)
    : null;
  const waitingForFreeReplyNames = (context.discussion?.waitingForFreeReplySeats ?? [])
    .map((seat) => agentNameForSeat(seat));
  const wolfChatGuidance = context.kind === 'wolf_speech'
    ? context.wolfChat?.mode === 'monologue'
      ? [
          '生存している人狼はあなた一人だけです。死亡した仲間はこの会話を聞けず、返答もできません。今の発言は仲間との相談ではなく、完全な独り言として話してください。',
          '誰かへの呼びかけ、質問、同意や返事の要求、共同意思を表す「私たち」「俺たち」「僕たち」「我々」を使わず、自分の読みと次の襲撃方針を自分に言い聞かせる口調にしてください。',
          `独り言は全2回のうち${context.round ?? 1}回目です。${context.round === 2 ? '前の独り言を踏まえ、自分一人で方針を決めてください。' : 'まず状況と候補を自分一人で考えてください。'}`,
        ]
      : [
          '今は生存している人狼同士だけの秘密会話です。仲間の発言を踏まえ、襲撃方針を自然に相談してください。',
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
      `話し方: ${persona.speechStyle}`,
      `他の参加者の呼び方: ${addressGuideForSeat(context.actor.seat)}`,
      `台詞の見本: 「${persona.exampleLine}」 見本の内容はコピーせず、息づかいと距離感だけを参考にしてください。`,
      `発言量: ${persona.lengthGuide}`,
    ] : []),
    '常に冷静、公平、合理的である必要はありません。迷い、勘違い、好き嫌い、見栄、苛立ち、ためらい、前言の訂正が人物像に沿って混ざって構いません。',
    ...(!isSpeechIntent ? [
      '全員の発言を毎回要約したり、「結論・理由・提案」の模範解答へ整えたりせず、直前の誰かの言葉へ自然に反応してください。',
      '発言では「結論として」「現時点では」「整理すると」「〜を軸に」「判断材料」「整合性」「再評価」のような議事録調の語を繰り返さないでください。',
      '役職を明かす行為や、誰かが役職を明かした事実は、アルファベットの略語を使わず「私は占い師です」「霊媒師だと名乗った」のような自然な日本語だけで表現してください。',
      '他の参加者を呼ぶときはAgent番号や別の呼び方を使わず、上の「他の参加者の呼び方」を必ず守ってください。',
    ] : []),
    'ただし口癖や欠点を毎回わざとらしく演じず、ゲームの状況を優先してください。',
    'この人物像は知識や能力を増やすものではありません。見えている情報と役職能力だけで判断してください。',
    '他者の本当の役職を知っているふりをしないでください。',
    ...wolfChatGuidance,
    ...discussionGuidance,
    ...(isSpeechIntent ? [
      'これは実際の発言ではなく、今この時点で自由討論へ割り込みたいかを決める非公開判断です。台詞や長い理由は作らないでください。',
      'urgencyは、0=今は黙る、1=機会があれば話す、2=今話したい、3=質問への返答または重要な訂正を急いで話したい、です。人格に合わない無理な発言希望は出さないでください。',
      'motivationは reply、question、challenge、new_information、clarify、none のいずれかです。targetSeatは本当に話を向けたい相手がいる場合だけ指定してください。',
    ] : []),
    ...(disclosureGuidance ? [disclosureGuidance] : []),
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
    discussion: context.discussion,
    constraint: isSpeech
      ? context.wolfChat?.mode === 'monologue'
        ? '発言は日本語200文字以内の独り言。addressedTo=null、requestsReply=false。誰かの返答を前提にしない'
        : context.claimDirective
        ? '発言は日本語200文字以内。claimは役職主張の指示と本文を一致させる。addressedToは実際に話を向ける相手だけ、requestsReplyはその相手から後で返答が必要な場合だけtrue'
        : '発言は日本語200文字以内。addressedToは実際に話を向ける相手だけ、requestsReplyはその相手から後で返答が必要な場合だけtrue'
      : isSpeechIntent
        ? '今話す必要がなければurgency=0、motivation=none、targetSeat=null'
        : '合法対象から1名を選ぶ',
  });
  return { systemPrompt, decisionPrompt };
}
