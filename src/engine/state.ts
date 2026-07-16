import type { GameState, MatchEvent, Player, SeatId } from '@/domain/types';

export function createInitialState(players: Player[]): GameState {
  return { day: 0, phase: 'setup', players, lastGuard: null, lastExecuted: null, pendingVictim: null };
}

export function applyEvent(state: GameState, event: MatchEvent): GameState {
  const next: GameState = { ...state, players: state.players.map((player) => ({ ...player })), day: event.day, phase: event.phase };
  if (event.type === 'execution' && event.payload.seat) {
    const seat = event.payload.seat as SeatId;
    next.players = next.players.map((player) => player.seat === seat ? { ...player, alive: false } : player);
    next.lastExecuted = seat;
  }
  if (event.type === 'dawn' && event.payload.victim) {
    const seat = event.payload.victim as SeatId;
    next.players = next.players.map((player) => player.seat === seat ? { ...player, alive: false } : player);
  }
  if (event.type === 'guard_choice') next.lastGuard = event.payload.targetSeat as SeatId;
  return next;
}
