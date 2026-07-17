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

  it('claims v1で公開主張を決定論的に保存し、偽結果と対抗を発言上限内に収める', async () => {
    const first = await runMock('1000', 'v1');
    const second = await runMock('1000', 'v1');
    expect(first.events.map((event) => event.payload)).toEqual(second.events.map((event) => event.payload));
    expect(first.events.find((event) => event.type === 'match_created')?.payload.rules).toEqual({ claims: 'v1' });

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
    const calls: Array<{ kind: string; callKey: string }> = [];
    const base = new MockAI();
    const provider: DecisionProvider = {
      speech: (context) => { calls.push({ kind: context.kind, callKey: context.callKey }); return base.speech(context); },
      speechIntent: (context) => { calls.push({ kind: context.kind, callKey: context.callKey }); return base.speechIntent(context); },
      target: (context) => { calls.push({ kind: context.kind, callKey: context.callKey }); return base.target(context); },
    };
    await runGame('claim-priority', 'fixture-0', provider, { emit: async () => {}, checkpoint: async () => {} }, { claimsVersion: 'v1' });
    const first = calls.findIndex((call) => call.callKey === 'd1-speech-free-t1-seat-1');
    const second = calls.findIndex((call) => call.callKey === 'd1-speech-free-t2-seat-8');
    expect(first).toBeGreaterThan(0);
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

  it('返答不能な開始済み話者への重複質問を後続の合法対象から外す', async () => {
    const speechContexts: DecisionContext[] = [];
    const provider: DecisionProvider = {
      async speech(context): Promise<SpeechDecision> {
        speechContexts.push(structuredClone(context));
        const firstQuestion = context.day === 1 && context.discussion?.stage === 'opening' && context.actor.seat === 'seat-2';
        return firstQuestion
          ? { speech: '澪さん、後で理由を聞かせて。', addressedTo: 'seat-1', requestsReply: true }
          : { speech: '別の発言と自分の考えを見ます。', addressedTo: null, requestsReply: false };
      },
      async speechIntent(context): Promise<SpeechIntentDecision> {
        return context.day === 1 && context.actor.seat === 'seat-1' && context.discussion?.promptedBySeat === 'seat-2'
          ? { urgency: 3, motivation: 'reply', targetSeat: 'seat-2' }
          : { urgency: 0, motivation: 'none', targetSeat: null };
      },
      async target(context): Promise<TargetDecision> {
        return { targetSeat: context.legalTargets[0], statedReason: '合法対象の先頭を選びます。' };
      },
    };

    await runGame('opening-reply-dedup', 'opening-reply-dedup', provider, { emit: async () => {}, checkpoint: async () => {} });
    const thirdOpening = speechContexts.find((context) =>
      context.day === 1 && context.discussion?.stage === 'opening' && context.actor.seat === 'seat-3');
    expect(thirdOpening?.discussion?.openingSpokenSeats).toEqual(['seat-1', 'seat-2']);
    expect(thirdOpening?.discussion?.waitingForFreeReplySeats).toEqual(['seat-1']);
    expect(thirdOpening?.legalTargets).not.toContain('seat-1');
    const reply = speechContexts.find((context) =>
      context.day === 1 && context.discussion?.stage === 'free' && context.actor.seat === 'seat-1');
    expect(reply?.discussion).toMatchObject({ promptedBySeat: 'seat-2', motivation: 'reply' });
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
