import { describe, expect, it } from 'vitest';
import type { DecisionContext, DecisionProvider, MatchEvent, SpeechDecision, SpeechIntentDecision, TargetDecision } from '@/domain/types';
import { runGame } from '@/engine/game';
import { MockAI } from '@/server/ai/mock';
import { runMock } from '../helpers/runMock';
import { claimLedgerFromEvents } from '@/domain/claims';
import { NIGHT_ZERO_UNINFORMED_FACT } from '@/domain/constants';
import { setupPlayers } from '@/engine/setup';
import { stableIndex } from '@/engine/prng';

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
  it('新規第0夜はAI targetを呼ばずseedで選び、後夜だけ選択理由を保持する', async () => {
    const seed = 'night-zero-uninformed';
    const players = setupPlayers(seed);
    const seerSeat = players.find((player) => player.role === 'seer')!.seat;
    const base = new MockAI();
    const targetContexts: DecisionContext[] = [];
    const speechContexts: DecisionContext[] = [];
    const laterReason = '1日目の公開発言を比較した決定です。';
    const provider: DecisionProvider = {
      speech: async (context) => {
        speechContexts.push(structuredClone(context));
        return base.speech(context);
      },
      speechIntent: (context) => base.speechIntent(context),
      target: async (context) => {
        targetContexts.push(structuredClone(context));
        const protectedTarget = context.legalTargets.find((seat) => seat !== seerSeat) ?? context.legalTargets[0];
        return {
          targetSeat: context.kind === 'seer' ? context.legalTargets[0] : protectedTarget,
          statedReason: context.kind === 'seer' ? laterReason : '公開情報を比較した決定です。',
        };
      },
    };
    const events: MatchEvent[] = [];
    await runGame('night-zero-uninformed', seed, provider, {
      emit: async (draft) => {
        events.push({ ...draft, matchId: 'night-zero-uninformed', seq: events.length + 1, createdAt: '' });
      },
      checkpoint: async () => {},
    }, { claimsVersion: 'v2', discussionVersion: 'v3' });

    expect(targetContexts.some((context) => context.callKey === 'd0-seer')).toBe(false);
    const legalNightZeroTargets = players.filter((player) => player.seat !== seerSeat).map((player) => player.seat);
    const expectedTarget = legalNightZeroTargets[stableIndex(seed, 'd0-seer', legalNightZeroTargets.length)];
    expect(events.find((event) => event.day === 0 && event.type === 'seer_result')?.payload.targetSeat).toBe(expectedTarget);
    expect(events.find((event) => event.type === 'match_created')?.payload.rules).toMatchObject({ nightZero: 'uniform' });
    const dayOneSeerContext = speechContexts.find((context) => context.day === 1 && context.actor.seat === seerSeat);
    expect(dayOneSeerContext?.privateFacts).toContain(NIGHT_ZERO_UNINFORMED_FACT);
    expect(dayOneSeerContext?.privateFacts.join('\n')).not.toMatch(/0日目に.+を占った理由/);
    const laterSeerContext = speechContexts.find((context) => context.day >= 2 && context.actor.seat === seerSeat);
    expect(laterSeerContext?.privateFacts.join('\n')).toContain(`占った理由: ${laterReason}`);
  });
  it('投票理由の未宣言役職COを票先を変えずfail-closedで置換する', async () => {
    const seed = 'vote-reason-claim-bypass';
    const players = setupPlayers(seed);
    const unclaimedSeat = players.find((player) => player.role === 'villager')!.seat;
    const base = new MockAI();
    let intendedTarget: string | null = null;
    const provider: DecisionProvider = {
      speech: (context) => base.speech(context),
      speechIntent: (context) => base.speechIntent(context),
      target: async (context) => {
        const decision = await base.target(context);
        if (context.kind === 'vote' && context.day === 1 && context.actor.seat === unclaimedSeat) {
          intendedTarget = decision.targetSeat;
          return { ...decision, statedReason: '俺が霊媒師だ。この候補へ投票する。' };
        }
        return decision;
      },
    };
    const events: MatchEvent[] = [];
    await runGame('vote-reason-claim-bypass', seed, provider, {
      emit: async (draft) => {
        events.push({ ...draft, matchId: 'vote-reason-claim-bypass', seq: events.length + 1, createdAt: '' });
      },
      checkpoint: async () => {},
    }, { claimsVersion: 'v2', discussionVersion: 'v3' });

    const reveal = events.find((event) => event.day === 1 && event.type === 'vote_reveal')!;
    const vote = (reveal.payload.votes as Array<Record<string, unknown>>).find((item) => item.voter === unclaimedSeat);
    expect(vote).toMatchObject({ target: intendedTarget, reasonSanitized: true });
    expect(vote?.statedReason).toBe('公開された議論と候補を比較して決めました。');
    expect(String(vote?.statedReason)).not.toContain('霊媒師');
  });
  it('1日目は当然の犠牲者なしを省略し、公開イベントが発言から始まる', async () => {
    const { events } = await runMock('day-one-start');
    expect(events.some((event) => event.day === 1 && event.type === 'dawn')).toBe(false);
    expect(events.find((event) => event.visibility === 'public')?.type).toBe('discussion_speech');
  });
  it('各昼で全員が1回以上話し、通常2回と合意対象だけの追加反論1回を守る', async () => {
    const { events } = await runMock('speech-rounds');
    for (const day of new Set(events.filter((event) => event.type === 'discussion_speech').map((event) => event.day))) {
      const speeches = events.filter((event) => event.day === day && event.type === 'discussion_speech');
      const speakerOrder = speeches.map((event) => String(event.payload.seat));
      for (let index = 0; index < speakerOrder.length; index += 1) {
        expect(speakerOrder[index]).not.toBe(speakerOrder[index - 1]);
        expect(speakerOrder[index]).not.toBe(speakerOrder[index - 2]);
      }
      const counts = new Map<string, number>();
      for (const event of speeches) counts.set(String(event.payload.seat), (counts.get(String(event.payload.seat)) ?? 0) + 1);
      const closed = events.find((event) => event.day === day && event.type === 'discussion_closed')!;
      const minimum = Number(closed.payload.minimumSpeeches);
      const maximum = Number(closed.payload.maximumSpeeches);
      const consensusDefenseExtraSpeeches = Number(closed.payload.consensusDefenseExtraSpeeches ?? 0);
      expect(counts.size).toBe(Number(closed.payload.openingSpeeches));
      expect(counts.size).toBe(maximum / 2);
      expect([...counts.values()].every((count) => count >= 1 && count <= 3)).toBe(true);
      expect([...counts.values()].filter((count) => count === 3)).toHaveLength(consensusDefenseExtraSpeeches);
      expect(consensusDefenseExtraSpeeches).toBeLessThanOrEqual(1);
      expect(minimum).toBe(Math.max(counts.size, Math.ceil((14 * counts.size) / 9)));
      expect(maximum).toBe(Math.min(18, counts.size * 2));
      expect(speeches.length).toBeGreaterThanOrEqual(minimum);
      expect(speeches.length).toBeLessThanOrEqual(maximum + consensusDefenseExtraSpeeches);
      expect(closed.payload.totalSpeeches).toBe(speeches.length);
      expect(maximum).toBeLessThanOrEqual(18);
      if (day === 1) {
        expect(minimum).toBe(14);
        expect(maximum).toBe(18);
      }
    }
  });

  it('同一論点が3人へ広がると後続contextへ飽和論点を渡し、有効な引用元を公開構造へ残す', async () => {
    const contexts: DecisionContext[] = [];
    const events: MatchEvent[] = [];
    let firstSource: DecisionContext['actor']['seat'] | null = null;
    const provider: DecisionProvider = {
      async speech(context): Promise<SpeechDecision> {
        if (context.kind === 'wolf_speech' || !context.discussion) {
          return { speech: '今夜の方針を考える。', addressedTo: null, requestsReply: false };
        }
        contexts.push(structuredClone(context));
        const targetSeat = context.actor.seat === 'seat-9' ? 'seat-8' : 'seat-9';
        const echoSourceSeat = targetSeat === 'seat-9' ? firstSource : null;
        if (targetSeat === 'seat-9' && firstSource === null) firstSource = context.actor.seat;
        return {
          speech: `${targetSeat}の言い回しが気になる。`, addressedTo: null, requestsReply: false,
          structure: {
            primaryAct: 'suspicion', questionTopic: null,
            suspicion: { targetSeat, basis: 'statement_slip', echoSourceSeat },
            voteIntent: null, boardAnalysis: false,
          },
        };
      },
      async speechIntent(): Promise<SpeechIntentDecision> {
        return { urgency: 0, motivation: 'none', targetSeat: null };
      },
      async target(context): Promise<TargetDecision> {
        return { targetSeat: context.legalTargets[0], statedReason: '合法候補を比較した。' };
      },
    };
    await runGame('saturated-point', 'saturated-point', provider, {
      emit: async (event) => { events.push({ ...event, matchId: 'saturated-point', seq: events.length + 1, createdAt: '' }); },
      checkpoint: async () => {},
    });

    expect(contexts.some((context) => context.day === 1 &&
      context.discussion?.saturatedPoint?.targetSeat === 'seat-9' &&
      context.discussion.saturatedPoint.basis === 'statement_slip' &&
      context.discussion.saturatedPoint.speakers >= 3)).toBe(true);
    const echoed = events.filter((event) => event.day === 1 && event.type === 'discussion_speech')
      .map((event) => event.payload.structure as SpeechDecision['structure'])
      .filter((structure) => structure?.suspicion?.targetSeat === 'seat-9' && structure.suspicion.echoSourceSeat);
    expect(echoed.length).toBeGreaterThanOrEqual(2);
    expect(echoed.every((structure) => structure?.suspicion?.echoSourceSeat === firstSource)).toBe(true);
  });

  it('3人目の同一投票予定後、2回発言済みの対象本人へ追加反論枠を1回だけ渡す', async () => {
    const speechContexts: DecisionContext[] = [];
    const targetByDay = new Map<number, DecisionContext['actor']['seat']>();
    const intentCounts = new Map<number, number>();
    const provider: DecisionProvider = {
      async speech(context): Promise<SpeechDecision> {
        speechContexts.push(structuredClone(context));
        const target = targetByDay.get(context.day) ?? context.actor.seat;
        targetByDay.set(context.day, target);
        const isTarget = context.actor.seat === target;
        const intentCount = intentCounts.get(context.day) ?? 0;
        const replyTarget = context.legalTargets.find((seat) => seat !== target) ?? context.legalTargets[0] ?? null;

        if (context.discussion?.turn === 1) {
          return {
            speech: '最初にあなたの考えを聞きたい。', addressedTo: replyTarget, requestsReply: true,
            structure: { primaryAct: 'question', questionTopic: 'gray_read', suspicion: null, voteIntent: null, boardAnalysis: false },
          };
        }
        if (!isTarget && context.discussion?.turn === 2) {
          intentCounts.set(context.day, intentCount + 1);
          return {
            speech: '回答しつつ、現時点では最初の話者へ投票する。', addressedTo: target, requestsReply: true,
            structure: { primaryAct: 'vote_intent', questionTopic: 'defense', suspicion: { targetSeat: target, basis: 'speech_content' }, voteIntent: target, boardAnalysis: false },
          };
        }
        if (isTarget) {
          return {
            speech: context.discussion?.consensusDefense ? '集まった疑いへ具体的に反論する。' : '質問へ答え、判断材料を示す。',
            addressedTo: null, requestsReply: false,
            structure: { primaryAct: context.discussion?.consensusDefense ? 'defense' : 'answer', questionTopic: 'defense', suspicion: null, voteIntent: null, boardAnalysis: false },
          };
        }
        if (intentCount < 3) {
          intentCounts.set(context.day, intentCount + 1);
          return {
            speech: '発言内容を根拠に同じ候補へ投票予定を置く。', addressedTo: null, requestsReply: false,
            structure: { primaryAct: 'vote_intent', questionTopic: null, suspicion: { targetSeat: target, basis: 'speech_content' }, voteIntent: target, boardAnalysis: false },
          };
        }
        return {
          speech: '反論後の盤面を改めて比較する。', addressedTo: null, requestsReply: false,
          structure: { primaryAct: 'board_analysis', questionTopic: null, suspicion: null, voteIntent: null, boardAnalysis: true },
        };
      },
      async speechIntent(): Promise<SpeechIntentDecision> {
        return { urgency: 0, motivation: 'none', targetSeat: null };
      },
      async target(context): Promise<TargetDecision> {
        return { targetSeat: context.legalTargets[0], statedReason: '合法対象を選ぶ。' };
      },
    };

    const events: Array<{ day: number; type: string; payload: Record<string, unknown> }> = [];
    await runGame('consensus-defense', 'consensus-defense', provider, {
      emit: async (event) => { events.push({ day: event.day, type: event.type, payload: event.payload }); },
      checkpoint: async () => {},
    });

    const dayOneTarget = targetByDay.get(1);
    const targetSpeeches = speechContexts.filter((context) =>
      context.day === 1 && context.kind === 'speech' && context.actor.seat === dayOneTarget);
    expect(targetSpeeches).toHaveLength(3);
    expect(targetSpeeches[2].discussion?.consensusDefense).toBe(true);
    expect(targetSpeeches[2].discussion?.consensusTarget).toBe(dayOneTarget);
    const closed = events.find((event) => event.day === 1 && event.type === 'discussion_closed');
    expect(closed?.payload.consensusDefenseExtraSpeeches).toBe(1);
  });

  it('claims v1で公開主張を決定論的に保存し、偽結果と対抗を発言上限内に収める', async () => {
    const first = await runMock('1000', 'v1');
    const second = await runMock('1000', 'v1');
    expect(first.events.map((event) => event.payload)).toEqual(second.events.map((event) => event.payload));
    expect(first.events.find((event) => event.type === 'match_created')?.payload.rules).toEqual({ discussion: 'v3', claims: 'v1', nightZero: 'uniform' });

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
      expect(Number(closed.payload.freeSpeeches)).toBeLessThanOrEqual(
        Number(closed.payload.openingSpeeches) + Number(closed.payload.consensusDefenseExtraSpeeches ?? 0));
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

  it('返答要求をつなげても同じ話者の間に必ず別の2人を挟む', async () => {
    const speechContexts: DecisionContext[] = [];
    let firstSeat: DecisionContext['actor']['seat'] | null = null;
    let secondSeat: DecisionContext['actor']['seat'] | null = null;
    let thirdSeat: DecisionContext['actor']['seat'] | null = null;
    const provider: DecisionProvider = {
      async speech(context): Promise<SpeechDecision> {
        speechContexts.push(structuredClone(context));
        if (context.day === 1 && context.discussion?.turn === 1) {
          firstSeat = context.actor.seat;
          secondSeat = context.legalTargets[0];
          return { speech: 'あなたの考えを聞いてみたいです。', addressedTo: secondSeat, requestsReply: true };
        }
        if (context.day === 1 && context.discussion?.turn === 2) {
          thirdSeat = context.legalTargets[0];
          return { speech: '質問に答えます。次はあなたの考えを聞かせてください。', addressedTo: thirdSeat, requestsReply: true };
        }
        if (context.day === 1 && context.discussion?.turn === 3) {
          return { speech: '私も答えます。最初の話者はどう思いますか？', addressedTo: firstSeat, requestsReply: true };
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

    await runGame('immediate-reply', 'immediate-reply', provider, { emit: async () => {}, checkpoint: async () => {} }, { discussionVersion: 'v2' });
    const dayOne = speechContexts.filter((context) => context.day === 1 && context.kind === 'speech');
    expect(dayOne.slice(0, 4).map((context) => context.actor.seat)).toEqual([firstSeat, secondSeat, thirdSeat, firstSeat]);
    expect(dayOne.slice(0, 4).map((context) => context.discussion?.stage)).toEqual(['opening', 'opening', 'opening', 'free']);
    expect(dayOne[1].discussion).toMatchObject({ promptedBySeat: firstSeat, motivation: 'reply' });
    expect(dayOne[2].discussion).toMatchObject({ promptedBySeat: secondSeat, motivation: 'reply' });
    expect(dayOne[3].discussion).toMatchObject({ promptedBySeat: thirdSeat, motivation: 'reply' });
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
    }, { discussionVersion: 'v2' });

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
    }, { discussionVersion: 'v2' });

    const soloContexts = contexts.filter((context) =>
      context.kind === 'wolf_speech' && context.wolfChat?.mode === 'monologue');
    expect(soloContexts).toHaveLength(1);
    for (const context of soloContexts) {
      expect(context.wolfChat?.participantSeats).toEqual([context.actor.seat]);
      expect(context.privateFacts).toContain('生存中の人狼仲間: なし（自分だけ）');
      expect(context.privateFacts.some((fact) => fact.startsWith('死亡した人狼仲間:'))).toBe(true);
    }

    const wolfChatEvents = events.filter((event) => event.type === 'werewolf_chat');
    expect(wolfChatEvents.some((event) => event.payload.mode === 'dialogue')).toBe(true);
    expect(wolfChatEvents.filter((event) => event.payload.mode === 'monologue')).toHaveLength(1);
  });
});
