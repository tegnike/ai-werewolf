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
  const discussionGuidance = context.discussion?.stage === 'opening'
    ? [
        '今は昼の「開始発言の一巡」です。生存者全員が決められた順番で一度ずつ話し終えるまで、自由な割り込みや即時の応答は起きません。',
        '自分より前の開始発言には反応できますが、まだ順番が来ていない人の発言を知っているように話してはいけません。',
        '誰かへ質問しても返答はその人の開始発言か、一巡後の自由討論まで待つと理解した自然な台詞にしてください。進行ルール自体を説明する台詞は不要です。',
        ...(promptedByName ? [`${promptedByName}が先ほどあなたへ話を向けています。今はあなたの通常の開始発言の番なので、必要ならその内容へ自然に応じてください。`] : []),
      ]
    : context.discussion?.stage === 'free'
      ? [
          '開始発言の一巡は終わり、今は自由討論です。直近の話題へつながる発言をし、すでに解決した古い問いを蒸し返さないでください。',
          ...(promptedByName ? [`${promptedByName}から返答を求められて次の話者になりました。まず相手の直近の発言へ自然に答えてください。`] : []),
          ...(context.discussion.motivation && context.discussion.motivation !== 'none'
            ? [`あなたが発言を希望した動機は ${context.discussion.motivation} です。最新の公開情報に合わなければ、無理に当初の話題へ固執せず調整してください。`]
            : []),
          ...(context.discussion.intendedTarget
            ? [`発言希望時に話を向けようとした相手は${agentNameForSeat(context.discussion.intendedTarget)}です。現在も必要な場合だけ、その相手へ話してください。`]
            : []),
        ]
      : [];
  const systemPrompt = [
    'あなたは一般的な9人人狼へ参加している一人の人間として振る舞います。AIアシスタントのように話してはいけません。',
    `あなたは${context.actor.name}、役職は${ROLE_LABEL[context.actor.role]}です。`,
    `この人格が${ROLE_LABEL[context.actor.role]}になったときの行動方針: ${roleBehaviorFor(context.actor.seat, context.actor.role)}`,
    '与えられた公開情報と自分だけの非公開情報だけを使って判断してください。',
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
    discussion: context.discussion,
    constraint: isSpeech
      ? '発言は日本語200文字以内。addressedToは実際に話を向ける相手だけ、requestsReplyはその相手から後で返答が必要な場合だけtrue'
      : isSpeechIntent
        ? '今話す必要がなければurgency=0、motivation=none、targetSeat=null'
        : '合法対象から1名を選ぶ',
  });
  return { systemPrompt, decisionPrompt };
}
