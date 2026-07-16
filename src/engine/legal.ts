import type { GameState, SeatId } from '@/domain/types';

export const aliveSeats = (state: GameState): SeatId[] => state.players.filter((player) => player.alive).map((player) => player.seat);

export function legalVoteTargets(state: GameState, actor: SeatId, candidates?: SeatId[]): SeatId[] {
  const pool = candidates ?? aliveSeats(state);
  return pool.filter((seat) => seat !== actor && state.players.some((player) => player.seat === seat && player.alive));
}

export function legalAttackTargets(state: GameState): SeatId[] {
  return state.players.filter((player) => player.alive && player.role !== 'werewolf').map((player) => player.seat);
}

export function legalSeerTargets(state: GameState, actor: SeatId): SeatId[] {
  return aliveSeats(state).filter((seat) => seat !== actor);
}

export function legalGuardTargets(state: GameState): SeatId[] {
  const alive = aliveSeats(state);
  const withoutPrevious = alive.filter((seat) => seat !== state.lastGuard);
  return withoutPrevious.length > 0 ? withoutPrevious : alive;
}
