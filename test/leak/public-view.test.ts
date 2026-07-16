import { describe, expect, it } from 'vitest';
import { projectEvents } from '@/server/view';
import { runMock } from '../helpers/runMock';

const forbiddenTypes = ['werewolf_chat', 'attack_choice', 'seer_result', 'medium_result', 'guard_choice', 'night_resolved', 'decision_note'];
describe('公開viewの秘密情報分離', () => {
  it('終了前の公開レスポンスに秘密イベント・役職・audienceを含めない', async () => {
    const { events } = await runMock('leak');
    const beforeFinish = events.filter((event) => event.type !== 'match_finished' && event.type !== 'anomaly_flag');
    const projected = projectEvents(beforeFinish, 'public');
    expect(projected.some((event) => forbiddenTypes.includes(event.type))).toBe(false);
    const json = JSON.stringify(projected);
    expect(json).not.toContain('audienceSeats');
    expect(json).not.toMatch(/"role"\s*:/);
    expect(json).not.toContain('config_json');
  });
});
