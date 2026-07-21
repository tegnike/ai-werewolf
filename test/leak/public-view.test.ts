import { describe, expect, it } from 'vitest';
import { canRevealSecrets, projectEvents } from '@/server/view';
import { runMock } from '../helpers/runMock';

const forbiddenTypes = [
  'match_created', 'werewolf_reveal', 'werewolf_chat', 'vote_cast', 'attack_choice',
  'seer_result', 'medium_result', 'guard_choice', 'night_resolved', 'decision_note',
];
describe('公開viewの秘密情報分離', () => {
  it('終了前の公開レスポンスで秘密イベントを内容のない実施ログに置き換える', async () => {
    const { events } = await runMock('leak');
    const beforeFinish = events.filter((event) => event.type !== 'match_finished' && event.type !== 'anomaly_flag');
    const projected = projectEvents(beforeFinish, 'public');
    const privateEvents = beforeFinish.filter((event) => event.visibility === 'private');
    const redactedEvents = projected.filter((event) => event.type === 'private_action');

    expect(redactedEvents).toHaveLength(privateEvents.length);
    expect(redactedEvents.map((event) => event.seq)).toEqual(privateEvents.map((event) => event.seq));
    const werewolfRevealSeq = privateEvents.find((event) => event.type === 'werewolf_reveal')?.seq;
    expect(redactedEvents.find((event) => event.seq === werewolfRevealSeq)?.payload).toEqual({ label: '人狼確認' });
    expect(projected.some((event) => forbiddenTypes.includes(event.type))).toBe(false);
    const json = JSON.stringify(projected);
    expect(json).not.toContain('audienceSeats');
    expect(json).not.toMatch(/"role"\s*:/);
    expect(json).not.toContain('statedReason');
    expect(json).not.toContain('config_json');
  });

  it('終了済みでも明示的な答え合わせ要求までは公開射影を維持する', async () => {
    const { events } = await runMock('reveal');
    const hidden = projectEvents(events, 'public', canRevealSecrets('public', 'finished', false));
    expect(hidden.some((event) => event.type === 'private_action')).toBe(true);
    expect(hidden.some((event) => event.type === 'match_created')).toBe(false);
    expect(hidden.some((event) => event.type === 'werewolf_chat')).toBe(false);
    expect(JSON.stringify(hidden)).not.toContain('statedReason');

    const projected = projectEvents(events, 'public', canRevealSecrets('public', 'finished', true));
    expect(projected.some((event) => event.type === 'match_created')).toBe(true);
    expect(projected.some((event) => event.type === 'werewolf_chat')).toBe(true);
    expect(projected.some((event) => event.type === 'seer_result')).toBe(true);
    expect(projected.some((event) => event.type === 'night_resolved')).toBe(true);
    expect(JSON.stringify(projected)).toMatch(/"role"\s*:/);
    expect(JSON.stringify(projected)).toContain('statedReason');
  });

  it('進行中は答え合わせを要求されても開示せず、GM視点は常に開示する', () => {
    expect(canRevealSecrets('public', 'running', true)).toBe(false);
    expect(canRevealSecrets('public', 'finished', false)).toBe(false);
    expect(canRevealSecrets('public', 'finished', true)).toBe(true);
    expect(canRevealSecrets('gm', 'running', false)).toBe(true);
  });

  it('単独人狼の独り言modeを進行中の公開viewへ漏らさない', () => {
    const event = {
      matchId: 'lone-wolf', seq: 10, day: 2, phase: 'wolf_chat' as const, type: 'werewolf_chat', visibility: 'private' as const,
      audienceSeats: ['seat-1' as const], payload: { seat: 'seat-1', speech: '一人で決める。', round: 1, mode: 'monologue' },
      createdAt: '2026-07-17T00:00:00.000Z',
    };

    const [projected] = projectEvents([event], 'public');
    expect(projected.type).toBe('private_action');
    expect(projected.payload).toEqual({ label: '人狼の夜会話' });
    expect(JSON.stringify(projected)).not.toContain('monologue');
    expect(JSON.stringify(projected)).not.toContain('独り言');
  });

  it('旧試合に残る1日目の夜明けは公開・GM両視点から除外する', () => {
    const legacyDawn = {
      matchId: 'legacy', seq: 6, day: 1, phase: 'dawn' as const, type: 'dawn', visibility: 'public' as const,
      audienceSeats: [], payload: { victim: null, message: '犠牲者はいません。' }, createdAt: '2026-07-16T00:00:00.000Z',
    };
    const firstSpeech = {
      ...legacyDawn, seq: 7, phase: 'discussion' as const, type: 'discussion_speech', payload: { seat: 'seat-1', speech: '話しましょう。' },
    };

    expect(projectEvents([legacyDawn, firstSpeech], 'public').map((event) => event.seq)).toEqual([7]);
    expect(projectEvents([legacyDawn, firstSpeech], 'gm').map((event) => event.seq)).toEqual([7]);
  });

  it('公開claimを厳密allowlistで射影し、方針や真役職を同乗させない', async () => {
    const { events } = await runMock('1000', 'v4');
    const projected = projectEvents(events.filter((event) => event.type !== 'match_finished'), 'public');
    const speech = projected.find((event) => event.type === 'discussion_speech' && event.payload.claim);
    expect(speech?.payload.claim).toBeTruthy();
    const claim = speech?.payload.claim as Record<string, unknown>;
    expect(Object.keys(claim).sort()).toEqual(['claimedRole', 'results']);
    expect(Object.keys((claim.results as Array<Record<string, unknown>>)[0]).sort()).toEqual(['day', 'targetSeat', 'verdict']);
    const json = JSON.stringify(projected);
    expect(json).not.toMatch(/"role"\s*:/);
    expect(json).not.toContain('claimDirective');
    expect(json).not.toContain('counterTargetSeat');
    expect(json).not.toContain('stance');
    expect(json).not.toContain('claimIntent');
    expect(json).not.toContain('avoid_crowding');
  });
});
