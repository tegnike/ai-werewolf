import { describe, expect, it } from 'vitest';
import { projectEvents } from '@/server/view';
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

  it('終了後の公開viewでは役職と非公開行動を答え合わせできる', async () => {
    const { events } = await runMock('reveal');
    const projected = projectEvents(events, 'public', true);
    expect(projected.some((event) => event.type === 'match_created')).toBe(true);
    expect(projected.some((event) => event.type === 'werewolf_chat')).toBe(true);
    expect(projected.some((event) => event.type === 'seer_result')).toBe(true);
    expect(projected.some((event) => event.type === 'night_resolved')).toBe(true);
    expect(JSON.stringify(projected)).toMatch(/"role"\s*:/);
    expect(JSON.stringify(projected)).toContain('statedReason');
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
});
