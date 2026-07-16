import { ROLE_LABEL } from '@/domain/constants';
import type { DecisionContext } from '@/domain/types';
import { personaForSeat } from '@/domain/agents';

export function buildPrompts(context: DecisionContext): { systemPrompt: string; decisionPrompt: string } {
  const persona = personaForSeat(context.actor.seat);
  const systemPrompt = [
    'あなたは一般的な9人人狼の匿名AIプレイヤーです。',
    `あなたは${context.actor.name}、役職は${ROLE_LABEL[context.actor.role]}です。`,
    '与えられた公開情報と自分だけの非公開情報だけを使って判断してください。',
    `あなたの会話上の個性は「${persona.title}」です。${persona.temperament}`,
    `話し方: ${persona.speechStyle}`,
    `発言量: ${persona.lengthGuide}`,
    'この個性は知識や能力を増やすものではありません。見えている情報と役職能力だけで判断してください。',
    '他者の本当の役職を知っているふりをしないでください。',
    '内部の思考過程は書かず、要求された結論と短い理由だけを返してください。',
  ].join('\n');
  const decisionPrompt = JSON.stringify({
    day: context.day,
    phase: context.phase,
    decision: context.kind,
    alive: context.players.filter((player) => player.alive).map((player) => ({ seat: player.seat, name: player.name })),
    legalTargets: context.legalTargets,
    publicHistory: context.publicHistory.slice(-80),
    privateFacts: context.privateFacts,
    constraint: context.kind.includes('speech') ? '発言は日本語200文字以内' : '合法対象から1名を選ぶ',
  });
  return { systemPrompt, decisionPrompt };
}
