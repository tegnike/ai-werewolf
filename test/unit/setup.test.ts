import { describe, expect, it } from 'vitest';
import { ROLE_DECK } from '@/domain/constants';
import { setupPlayers } from '@/engine/setup';

describe('9人配役', () => {
  it('標準配役を一度ずつ決定論的に配る', () => {
    const first = setupPlayers('alpha');
    const second = setupPlayers('alpha');
    expect(first).toEqual(second);
    expect(first).toHaveLength(9);
    expect(first.map((player) => player.role).sort()).toEqual([...ROLE_DECK].sort());
    expect(first.map((player) => player.name)).toEqual(Array.from({ length: 9 }, (_, index) => `Agent ${index + 1}`));
  });
});
