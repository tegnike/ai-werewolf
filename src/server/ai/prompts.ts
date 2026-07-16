import { ROLE_LABEL } from '@/domain/constants';
import type { DecisionContext } from '@/domain/types';
import { addressGuideForSeat, personaForSeat } from '@/domain/agents';
import { roleBehaviorFor } from '@/domain/role-behaviors';
import { resultDisclosureGuidance } from './disclosure';

export function buildPrompts(context: DecisionContext): { systemPrompt: string; decisionPrompt: string } {
  const persona = personaForSeat(context.actor.seat);
  const isSpeech = context.kind.includes('speech');
  const disclosureGuidance = resultDisclosureGuidance(context);
  const systemPrompt = [
    'あなたは一般的な9人人狼へ参加している一人の人間として振る舞います。AIアシスタントのように話してはいけません。',
    `あなたは${context.actor.name}、役職は${ROLE_LABEL[context.actor.role]}です。`,
    `この人格が${ROLE_LABEL[context.actor.role]}になったときの行動方針: ${roleBehaviorFor(context.actor.seat, context.actor.role)}`,
    '与えられた公開情報と自分だけの非公開情報だけを使って判断してください。',
    `人物像: 「${persona.title}」。${persona.coreDrive}`,
    `内面の矛盾と欠点: ${persona.contradiction}`,
    `人との接し方や思い込み: ${persona.socialBias}`,
    `感情の動き: ${persona.emotionalPattern}`,
    `話し方: ${persona.speechStyle}`,
    `他の参加者の呼び方: ${addressGuideForSeat(context.actor.seat)}`,
    `台詞の見本: 「${persona.exampleLine}」 見本の内容はコピーせず、息づかいと距離感だけを参考にしてください。`,
    `発言量: ${persona.lengthGuide}`,
    '常に冷静、公平、合理的である必要はありません。迷い、勘違い、好き嫌い、見栄、苛立ち、ためらい、前言の訂正が人物像に沿って混ざって構いません。',
    '全員の発言を毎回要約したり、「結論・理由・提案」の模範解答へ整えたりせず、直前の誰かの言葉へ自然に反応してください。',
    '発言では「結論として」「現時点では」「整理すると」「〜を軸に」「判断材料」「整合性」「再評価」のような議事録調の語を繰り返さないでください。',
    '役職を明かす行為や、誰かが役職を明かした事実は、アルファベットの略語を使わず「私は占い師です」「霊媒師だと名乗った」のような自然な日本語だけで表現してください。',
    '他の参加者を呼ぶときはAgent番号や別の呼び方を使わず、上の「他の参加者の呼び方」を必ず守ってください。',
    'ただし口癖や欠点を毎回わざとらしく演じず、ゲームの状況を優先してください。',
    'この人物像は知識や能力を増やすものではありません。見えている情報と役職能力だけで判断してください。',
    '他者の本当の役職を知っているふりをしないでください。',
    ...(disclosureGuidance ? [disclosureGuidance] : []),
    isSpeech
      ? '内部の思考過程や分析報告は書かず、その場で本人が実際に口にする台詞だけを返してください。'
      : '内部の思考過程は書かず、合法対象からの決定と短い理由だけを返してください。',
  ].join('\n');
  const decisionPrompt = JSON.stringify({
    day: context.day,
    phase: context.phase,
    decision: context.kind,
    alive: context.players.filter((player) => player.alive).map((player) => ({ seat: player.seat, name: player.name })),
    legalTargets: context.legalTargets,
    publicHistory: context.publicHistory.slice(-80).map((line) => line
      .replace(/占い(?:師)?CO(?:です)?/gi, '占い師だと名乗りました')
      .replace(/霊媒(?:師)?CO(?:です)?/gi, '霊媒師だと名乗りました')
      .replace(/CO(?:です)?/gi, '役職を名乗りました')),
    privateFacts: context.privateFacts,
    constraint: isSpeech ? '発言は日本語200文字以内' : '合法対象から1名を選ぶ',
  });
  return { systemPrompt, decisionPrompt };
}
