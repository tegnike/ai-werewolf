import { describe, expect, it } from 'vitest';
import type { DecisionContext, DecisionProvider, SpeechDecision, SpeechIntentDecision, TargetDecision } from '@/domain/types';
import { runGame } from '@/engine/game';
import { MockAI } from '@/server/ai/mock';
import { runMock } from '../helpers/runMock';
import { claimLedgerFromEvents } from '@/domain/claims';

describe('ゲームエンジン', () => {
  it('MockAIで終端し、同seedのpayload列が一致する', async () => {
    const first = await runMock('deterministic');
    const second = await runMock('deterministic');
    expect(first.result.winner).toMatch(/village|werewolf|draw/);
    expect(first.events.map((event) => event.payload)).toEqual(second.events.map((event) => event.payload));
    expect(first.events.at(-1)?.type).toBe('match_finished');
  });
  it('異なるseedでは昼の最初の話者が固定されない', async () => {
    const firstSpeakers = new Set<string>();
    for (const seed of Array.from({ length: 8 }, (_, index) => `first-speaker-${index}`)) {
      const { events } = await runMock(seed);
      const firstSpeech = events.find((event) => event.day === 1 && event.type === 'discussion_speech');
      firstSpeakers.add(String(firstSpeech?.payload.seat));
    }
    expect(firstSpeakers.size).toBeGreaterThan(1);
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
  it('各昼で全員が1回以上話し、人数別の総数と1人2回の上限を守る', async () => {
    const { events } = await runMock('speech-rounds');
    for (const day of new Set(events.filter((event) => event.type === 'discussion_speech').map((event) => event.day))) {
      const speeches = events.filter((event) => event.day === day && event.type === 'discussion_speech');
      const counts = new Map<string, number>();
      for (const event of speeches) counts.set(String(event.payload.seat), (counts.get(String(event.payload.seat)) ?? 0) + 1);
      const closed = events.find((event) => event.day === day && event.type === 'discussion_closed')!;
      const minimum = Number(closed.payload.minimumSpeeches);
      const maximum = Number(closed.payload.maximumSpeeches);
      expect(counts.size).toBe(Number(closed.payload.openingSpeeches));
      expect(counts.size).toBe(maximum / 2);
      expect([...counts.values()].every((count) => count >= 1 && count <= 2)).toBe(true);
      expect(minimum).toBe(Math.max(counts.size, Math.ceil((14 * counts.size) / 9)));
      expect(maximum).toBe(Math.min(18, counts.size * 2));
      expect(speeches.length).toBeGreaterThanOrEqual(minimum);
      expect(speeches.length).toBeLessThanOrEqual(maximum);
      expect(closed.payload.totalSpeeches).toBe(speeches.length);
      expect(maximum).toBeLessThanOrEqual(18);
      if (day === 1) {
        expect(minimum).toBe(14);
        expect(maximum).toBe(18);
      }
    }
  });

  it('claims v1で公開主張を決定論的に保存し、偽結果と対抗を発言上限内に収める', async () => {
    const first = await runMock('1000', 'v1');
    const second = await runMock('1000', 'v1');
    expect(first.events.map((event) => event.payload)).toEqual(second.events.map((event) => event.payload));
    expect(first.events.find((event) => event.type === 'match_created')?.payload.rules).toEqual({ discussion: 'v2', claims: 'v1' });

    const ledger = claimLedgerFromEvents(first.events);
    expect(ledger.length).toBeGreaterThanOrEqual(2);
    for (const entry of ledger) {
      expect(new Set(entry.results.map((result) => result.day)).size).toBe(entry.results.length);
      expect(entry.results.every((result) => result.day < result.announcedDay)).toBe(true);
      expect(entry.results.every((result) => result.targetSeat !== entry.seat)).toBe(true);
      for (const targetSeat of new Set(entry.results.map((result) => result.targetSeat))) {
        expect(new Set(entry.results.filter((result) => result.targetSeat === targetSeat).map((result) => result.verdict)).size).toBe(1);
      }
    }

    const created = first.events.find((event) => event.type === 'match_created')!;
    const roles = new Map((created.payload.players as Array<{ seat: string; role: string }>).map((player) => [player.seat, player.role]));
    expect(ledger.filter((entry) => roles.get(entry.seat) === 'werewolf').length).toBeLessThanOrEqual(1);

    for (const closed of first.events.filter((event) => event.type === 'discussion_closed')) {
      expect(Number(closed.payload.freeSpeeches)).toBeLessThanOrEqual(Number(closed.payload.openingSpeeches));
      expect(Number(closed.payload.intentPolls)).toBeLessThanOrEqual(2);
    }
  });

  it.each([
    ['fixture-1', []],
    ['fixture-0', ['madman']],
    ['fixture-4', ['werewolf']],
  ] as const)('fixture seed %sで所定の占い対抗レーンを再現する', async (seed, expectedDeceptiveRoles) => {
    const { events } = await runMock(seed, 'v1');
    const created = events.find((event) => event.type === 'match_created')!;
    const roles = new Map((created.payload.players as Array<{ seat: string; role: string }>).map((player) => [player.seat, player.role]));
    const ledger = claimLedgerFromEvents(events);
    const seerClaims = ledger.filter((entry) => entry.claimedRole === 'seer');
    const deceptiveRoles = seerClaims
      .map((entry) => roles.get(entry.seat))
      .filter((role): role is string => role === 'madman' || role === 'werewolf')
      .sort();
    expect(deceptiveRoles).toEqual([...expectedDeceptiveRoles].sort());
    if (seed === 'fixture-1') {
      expect(ledger.filter((entry) => ['madman', 'werewolf'].includes(roles.get(entry.seat) ?? ''))).toHaveLength(0);
    }
  });

  it('fixture seedで狂人の狼黒誤爆・白囲いと複数日履歴を再現する', async () => {
    const { events } = await runMock('fixture-0', 'v1');
    const created = events.find((event) => event.type === 'match_created')!;
    const roles = new Map((created.payload.players as Array<{ seat: string; role: string }>).map((player) => [player.seat, player.role]));
    const madman = claimLedgerFromEvents(events).find((entry) => roles.get(entry.seat) === 'madman')!;
    expect(madman.results.length).toBeGreaterThanOrEqual(2);
    expect(madman.results.some((result) => roles.get(result.targetSeat) === 'werewolf' && result.verdict === '人狼')).toBe(true);
    expect(madman.results.some((result) => roles.get(result.targetSeat) === 'werewolf' && result.verdict === '人狼ではない')).toBe(true);
  });

  it('必須の先出しと対抗をintent poll追加なしで自由討論の先頭へ入れる', async () => {
    const calls: Array<{ kind: string; callKey: string; claimed?: boolean }> = [];
    const base = new MockAI();
    const provider: DecisionProvider = {
      speech: async (context) => {
        const decision = await base.speech(context);
        calls.push({ kind: context.kind, callKey: context.callKey, claimed: Boolean(decision.claim) });
        return decision;
      },
      speechIntent: (context) => { calls.push({ kind: context.kind, callKey: context.callKey }); return base.speechIntent(context); },
      target: (context) => { calls.push({ kind: context.kind, callKey: context.callKey }); return base.target(context); },
    };
    await runGame('claim-priority', 'fixture-0', provider, { emit: async () => {}, checkpoint: async () => {} }, { claimsVersion: 'v1' });
    const claimIndexes = calls.flatMap((call, index) => call.claimed && call.callKey.startsWith('d1-') ? [index] : []);
    const [first, second] = claimIndexes;
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBe(first + 1);
    expect(calls.slice(0, second + 1).some((call) => call.kind === 'speech_intent')).toBe(false);
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

  it('返答を求めた相手へ即座に発言権を渡し、固定一巡より先に2回目の発言もできる', async () => {
    const speechContexts: DecisionContext[] = [];
    let firstSeat: DecisionContext['actor']['seat'] | null = null;
    let secondSeat: DecisionContext['actor']['seat'] | null = null;
    const provider: DecisionProvider = {
      async speech(context): Promise<SpeechDecision> {
        speechContexts.push(structuredClone(context));
        if (context.day === 1 && context.discussion?.turn === 1) {
          firstSeat = context.actor.seat;
          secondSeat = context.legalTargets[0];
          return { speech: 'あなたの考えを聞いてみたいです。', addressedTo: secondSeat, requestsReply: true };
        }
        if (context.day === 1 && context.discussion?.turn === 2) {
          return { speech: '質問に答えます。あなたはどう思いますか？', addressedTo: firstSeat, requestsReply: true };
        }
        return { speech: '今の段階で見えていることだけを話します。', addressedTo: null, requestsReply: false };
      },
      async speechIntent(): Promise<SpeechIntentDecision> {
        return { urgency: 0, motivation: 'none', targetSeat: null };
      },
      async target(context): Promise<TargetDecision> {
        return { targetSeat: context.legalTargets[0], statedReason: '合法対象の先頭を選びます。' };
      },
    };

    await runGame('immediate-reply', 'immediate-reply', provider, { emit: async () => {}, checkpoint: async () => {} });
    const dayOne = speechContexts.filter((context) => context.day === 1 && context.kind === 'speech');
    expect(dayOne.slice(0, 3).map((context) => context.actor.seat)).toEqual([firstSeat, secondSeat, firstSeat]);
    expect(dayOne.slice(0, 3).map((context) => context.discussion?.stage)).toEqual(['opening', 'opening', 'free']);
    expect(dayOne[1].discussion).toMatchObject({ promptedBySeat: firstSeat, motivation: 'reply' });
    expect(dayOne[2].discussion).toMatchObject({ promptedBySeat: secondSeat, motivation: 'reply' });
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

  it('生存人狼が1人になった夜会話を独り言modeにする', async () => {
    const contexts: DecisionContext[] = [];
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const provider: DecisionProvider = {
      async speech(context: DecisionContext): Promise<SpeechDecision> {
        contexts.push(structuredClone(context));
        return { speech: '次の襲撃先は自分で決める。', addressedTo: null, requestsReply: false };
      },
      async speechIntent(): Promise<SpeechIntentDecision> {
        return { urgency: 0, motivation: 'none', targetSeat: null };
      },
      async target(context: DecisionContext): Promise<TargetDecision> {
        if (context.kind === 'vote' || context.kind === 'runoff_vote') {
          const wolf = context.players.find((player) => player.alive && player.role === 'werewolf' && player.seat !== context.actor.seat);
          if (wolf && context.legalTargets.includes(wolf.seat)) {
            return { targetSeat: wolf.seat, statedReason: '単独人狼テストの投票' };
          }
        }
        return { targetSeat: context.legalTargets[0], statedReason: '単独人狼テストの合法対象' };
      },
    };

    await runGame('lone-wolf-chat', 'lone-wolf-chat', provider, {
      emit: async (event) => { events.push({ type: event.type, payload: event.payload }); },
      checkpoint: async () => {},
    });

    const soloContexts = contexts.filter((context) =>
      context.kind === 'wolf_speech' && context.wolfChat?.mode === 'monologue');
    expect(soloContexts).toHaveLength(2);
    for (const context of soloContexts) {
      expect(context.wolfChat?.participantSeats).toEqual([context.actor.seat]);
      expect(context.privateFacts).toContain('生存中の人狼仲間: なし（自分だけ）');
      expect(context.privateFacts.some((fact) => fact.startsWith('死亡した人狼仲間:'))).toBe(true);
    }

    const wolfChatEvents = events.filter((event) => event.type === 'werewolf_chat');
    expect(wolfChatEvents.some((event) => event.payload.mode === 'dialogue')).toBe(true);
    expect(wolfChatEvents.filter((event) => event.payload.mode === 'monologue')).toHaveLength(2);
  });
});
