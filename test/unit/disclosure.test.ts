import { describe, expect, it } from 'vitest';
import type { DecisionContext } from '@/domain/types';
import { setupPlayers } from '@/engine/setup';
import { validateSpeechDisclosure } from '@/server/ai/disclosure';

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
    expect(() => validateSpeechDisclosure(seerContext(), { speech: '征司さんが人狼だったよ。' })).toThrow('claim is required');
  });

  it('初回の役職名乗りと結果が同じ発言にあれば許可する', () => {
    expect(() => validateSpeechDisclosure(seerContext(), { speech: '私は占い師です。征司さんは人狼でした。' })).not.toThrow();
  });

  it('公開履歴で役職を名乗り済みなら結果だけの続報を許可する', () => {
    expect(() => validateSpeechDisclosure(seerContext(['八木 こはる: 私が占い師です。']), { speech: '今日の結果は人狼でした。' })).not.toThrow();
  });

  it('霊媒師も役職を名乗らない白結果公開を拒否する', () => {
    expect(() => validateSpeechDisclosure(mediumContext(), { speech: '征司さんは人狼ではありませんでした。' })).toThrow('claim is required');
  });

  it('アルファベット略語を含む発言は役職にかかわらず拒否する', () => {
    const context = { ...seerContext(), actor: { ...seerContext().actor, role: 'villager' as const } };
    expect(() => validateSpeechDisclosure(context, { speech: '陽太さんの占いCOが遅いです。' })).toThrow('abbreviated role claim is forbidden');
    expect(() => validateSpeechDisclosure(context, { speech: '征司さんは霊媒ＣＯでした。' })).toThrow('abbreviated role claim is forbidden');
  });
});
