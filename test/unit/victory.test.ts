import { describe, expect, it } from 'vitest';
import type { GameState, Role } from '@/domain/types';
import { checkVictory, isWerewolfResult } from '@/engine/victory';

function state(roles: Role[]): GameState {
  return { day: 1, phase: 'dawn', lastGuard: null, lastExecuted: null, pendingVictim: null, players: roles.map((role, index) => ({ seat: `seat-${index + 1}` as never, name: `Agent ${index + 1}`, role, alive: true })) };
}
describe('勝敗判定', () => {
  it('人狼が0なら村人勝利', () => expect(checkVictory(state(['villager', 'madman']))).toBe('village'));
  it('狂人を非人狼として人数に数える', () => {
    expect(checkVictory(state(['werewolf', 'madman']))).toBe('werewolf');
    expect(checkVictory(state(['werewolf', 'madman', 'villager']))).toBeNull();
  });
  it('狂人は占いと霊媒で人狼ではない', () => expect(isWerewolfResult('madman')).toBe('人狼ではない'));
});
