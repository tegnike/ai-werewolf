import type { GameState, Winner } from '@/domain/types';

export function checkVictory(state: GameState): Exclude<Winner, 'draw'> | null {
  const alive = state.players.filter((player) => player.alive);
  const wolves = alive.filter((player) => player.role === 'werewolf').length;
  if (wolves === 0) return 'village';
  if (wolves >= alive.length - wolves) return 'werewolf';
  return null;
}

export function isWerewolfResult(role: string): '人狼' | '人狼ではない' {
  return role === 'werewolf' ? '人狼' : '人狼ではない';
}
