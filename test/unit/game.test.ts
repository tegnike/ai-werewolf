import { describe, expect, it } from 'vitest';
import type { DecisionContext, DecisionProvider, SpeechDecision, SpeechIntentDecision, TargetDecision } from '@/domain/types';
import { runGame } from '@/engine/game';
import { MockAI } from '@/server/ai/mock';
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
  it('各昼で全員が開始発言し、自由討論と発言希望確認の上限を守る', async () => {
    const { events } = await runMock('speech-rounds');
    for (const day of new Set(events.filter((event) => event.type === 'discussion_speech').map((event) => event.day))) {
      const speeches = events.filter((event) => event.day === day && event.type === 'discussion_speech');
      const opening = speeches.filter((event) => event.payload.stage === 'opening');
      const free = speeches.filter((event) => event.payload.stage === 'free');
      const openingSeats = opening.map((event) => String(event.payload.seat));
      const freeCounts = new Map<string, number>();
      for (const event of free) freeCounts.set(String(event.payload.seat), (freeCounts.get(String(event.payload.seat)) ?? 0) + 1);
      expect(new Set(openingSeats).size).toBe(opening.length);
      expect(free.length).toBeLessThanOrEqual(opening.length);
      expect(speeches.length).toBeLessThanOrEqual(opening.length * 2);
      expect([...freeCounts.values()].every((count) => count <= 2)).toBe(true);
      expect(events.filter((event) => event.day === day && event.type === 'discussion_closed')).toHaveLength(1);
    }
  });

  it('発言希望確認を1日2回・各回4人以内に制限する', async () => {
    const calls: DecisionContext[] = [];
    const base = new MockAI();
    const provider: DecisionProvider = {
      speech: (context) => { calls.push(structuredClone(context)); return base.speech(context); },
      speechIntent: (context) => { calls.push(structuredClone(context)); return base.speechIntent(context); },
      target: (context) => { calls.push(structuredClone(context)); return base.target(context); },
    };

    await runGame('intent-budget', 'intent-budget', provider, { emit: async () => {}, checkpoint: async () => {} });
    const days = new Set(calls.filter((context) => context.kind === 'speech_intent').map((context) => context.day));
    for (const day of days) {
      const intents = calls.filter((context) => context.day === day && context.kind === 'speech_intent');
      expect(intents.length).toBeLessThanOrEqual(8);
      expect(new Set(intents.map((context) => context.callKey.match(/-p(\d+)-/)?.[1])).size).toBeLessThanOrEqual(2);
    }
  });

  it('開始一巡の後まで、すでに話した相手への返答を待たせる', async () => {
    const speechContexts: DecisionContext[] = [];
    const provider: DecisionProvider = {
      async speech(context): Promise<SpeechDecision> {
        speechContexts.push(structuredClone(context));
        const asksEarlierSpeaker = context.day === 1 && context.discussion?.stage === 'opening' && context.discussion.turn === 9;
        return asksEarlierSpeaker
          ? { speech: '澪さん、先ほどの考えをもう一度聞かせてください。', addressedTo: 'seat-1', requestsReply: true }
          : { speech: '今の段階で見えていることだけを話します。', addressedTo: null, requestsReply: false };
      },
      async speechIntent(context): Promise<SpeechIntentDecision> {
        return context.day === 1 && context.actor.seat === 'seat-1' && context.discussion?.promptedBySeat === 'seat-9'
          ? { urgency: 3, motivation: 'reply', targetSeat: 'seat-9' }
          : { urgency: 0, motivation: 'none', targetSeat: null };
      },
      async target(context): Promise<TargetDecision> {
        return { targetSeat: context.legalTargets[0], statedReason: '合法対象の先頭を選びます。' };
      },
    };

    await runGame('delayed-reply', 'delayed-reply', provider, { emit: async () => {}, checkpoint: async () => {} });
    const dayOne = speechContexts.filter((context) => context.day === 1 && context.kind === 'speech');
    expect(dayOne.slice(0, 9).map((context) => context.discussion?.stage)).toEqual(Array(9).fill('opening'));
    expect(dayOne[9].actor.seat).toBe('seat-1');
    expect(dayOne[9].discussion).toMatchObject({ stage: 'free', promptedBySeat: 'seat-9', motivation: 'reply' });
  });

  it('人狼と狩人の次の判断に最終襲撃と護衛の成否を引き継ぐ', async () => {
    const contexts: DecisionContext[] = [];
    const provider: DecisionProvider = {
      async speech(context: DecisionContext): Promise<SpeechDecision> {
        contexts.push(structuredClone(context));
        return { speech: 'これまでの情報を覚えています。', addressedTo: null, requestsReply: false };
      },
      async speechIntent(context: DecisionContext): Promise<SpeechIntentDecision> {
        contexts.push(structuredClone(context));
        return { urgency: 0, motivation: 'none', targetSeat: null };
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
