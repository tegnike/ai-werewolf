import { describe, expect, it } from 'vitest';
import { setupPlayers } from '@/engine/setup';
import { createInitialState } from '@/engine/state';
import { legalAttackTargets, legalGuardTargets, legalVoteTargets } from '@/engine/legal';

describe('合法対象', () => {
  it('自分へ投票できず、人狼は人狼を襲撃できない', () => {
    const state = createInitialState(setupPlayers('legal'));
    expect(legalVoteTargets(state, 'seat-1')).not.toContain('seat-1');
    const wolves = state.players.filter((player) => player.role === 'werewolf').map((player) => player.seat);
    expect(legalAttackTargets(state).some((seat) => wolves.includes(seat))).toBe(false);
  });
  it('連続護衛を禁止し、自分自身は護衛できる', () => {
    const state = { ...createInitialState(setupPlayers('guard')), lastGuard: 'seat-2' as const };
    expect(legalGuardTargets(state)).not.toContain('seat-2');
    expect(legalGuardTargets(state)).toContain('seat-1');
  });
});
