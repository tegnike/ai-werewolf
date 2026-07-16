import { ROLE_LABEL } from '@/domain/constants';
import type { DecisionContext } from '@/domain/types';

export function buildPrompts(context: DecisionContext): { systemPrompt: string; decisionPrompt: string } {
  const systemPrompt = [
    'あなたは一般的な9人人狼の匿名AIプレイヤーです。',
    `あなたは${context.actor.name}、役職は${ROLE_LABEL[context.actor.role]}です。`,
    '与えられた公開情報と自分だけの非公開情報だけを使って判断してください。',
    '他者の本当の役職を知っているふりをせず、短い日本語で答えてください。',
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
