import { describe, expect, it } from 'vitest';
import type { DecisionContext, DecisionProvider, SpeechDecision, TargetDecision } from '@/domain/types';
import { runGame } from '@/engine/game';
import { runMock } from '../helpers/runMock';

describe('ゲームエンジン', () => {
  it('MockAIで終端し、同seedのpayload列が一致する', async () => {
    const first = await runMock('deterministic');
    const second = await runMock('deterministic');
    expect(first.result.winner).toMatch(/village|werewolf|draw/);
    expect(first.events.map((event) => event.payload)).toEqual(second.events.map((event) => event.payload));
    expect(first.events.at(-1)?.type).toBe('match_finished');
  });
  it('第0夜に襲撃・護衛・霊媒がない', async () => {
    const { events } = await runMock('night-zero');
    const forbidden = events.filter((event) => event.day === 0 && ['attack_choice', 'guard_choice', 'medium_result'].includes(event.type));
    expect(forbidden).toHaveLength(0);
    expect(events.filter((event) => event.day === 0 && event.type === 'seer_result')).toHaveLength(1);
  });
  it('1日目は当然の犠牲者なしを省略し、公開イベントが発言から始まる', async () => {
    const { events } = await runMock('day-one-start');
    expect(events.some((event) => event.day === 1 && event.type === 'dawn')).toBe(false);
    expect(events.find((event) => event.visibility === 'public')?.type).toBe('discussion_speech');
  });
  it('各昼の生存者が2周発言する', async () => {
    const { events } = await runMock('speech-rounds');
    for (const day of new Set(events.filter((event) => event.type === 'discussion_speech').map((event) => event.day))) {
      const speeches = events.filter((event) => event.day === day && event.type === 'discussion_speech');
      const counts = new Map<string, number>();
      for (const event of speeches) counts.set(String(event.payload.seat), (counts.get(String(event.payload.seat)) ?? 0) + 1);
      expect([...counts.values()].every((count) => count === 2)).toBe(true);
    }
  });

  it('人狼と狩人の次の判断に最終襲撃と護衛の成否を引き継ぐ', async () => {
    const contexts: DecisionContext[] = [];
    const provider: DecisionProvider = {
      async speech(context: DecisionContext): Promise<SpeechDecision> {
        contexts.push(structuredClone(context));
        return { speech: 'これまでの情報を覚えています。' };
      },
      async target(context: DecisionContext): Promise<TargetDecision> {
        contexts.push(structuredClone(context));
        const guardSeat = context.players.find((player) => player.role === 'bodyguard')!.seat;
        const sacrifice = context.players.find((player) => player.role === 'madman')!.seat;
        const targetSeat = ['attack', 'attack_final', 'guard'].includes(context.kind)
          ? guardSeat
          : context.legalTargets.includes(sacrifice) ? sacrifice : context.legalTargets[0];
        return { targetSeat, statedReason: '履歴引き継ぎテスト' };
      },
    };

    await runGame('private-history', 'private-history', provider, {
      emit: async () => {},
      checkpoint: async () => {},
    });

    const dayTwoWolf = contexts.find((context) => context.day === 2 && context.kind === 'wolf_speech');
    const dayTwoGuard = contexts.find((context) => context.day === 2 && context.kind === 'speech' && context.actor.role === 'bodyguard');
    const dayTwoVillager = contexts.find((context) => context.day === 2 && context.kind === 'speech' && context.actor.role === 'villager');
    const guardName = dayTwoGuard?.actor.name;

    expect(dayTwoWolf?.privateFacts).toContain(`1日目の最終襲撃: ${guardName} → 護衛され襲撃失敗`);
    expect(dayTwoGuard?.privateFacts).toContain(`1日目: ${guardName}を護衛 → 護衛成功`);
    expect(dayTwoVillager?.privateFacts.join('\n')).not.toContain('最終襲撃');
    expect(dayTwoVillager?.privateFacts.join('\n')).not.toContain('護衛成功');
  });
});
