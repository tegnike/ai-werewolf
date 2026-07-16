import type { MatchEvent } from '../../src/domain/types';
import { runGame } from '../../src/engine/game';
import { MockAI } from '../../src/server/ai/mock';

export async function runMock(seed = '1000') {
  const events: MatchEvent[] = [];
  let seq = 0;
  const result = await runGame('test-match', seed, new MockAI(), {
    emit: async (draft) => { events.push({ ...draft, matchId: 'test-match', seq: ++seq, createdAt: '2026-01-01T00:00:00.000Z' }); },
    checkpoint: async () => {},
  });
  return { result, events };
}
