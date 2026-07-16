import { ROLE_DECK, SEATS } from '@/domain/constants';
import type { Player } from '@/domain/types';
import { stableShuffle } from './prng';

export function setupPlayers(seed: string): Player[] {
  const roles = stableShuffle(ROLE_DECK, seed, 'role-deck');
  return SEATS.map((seat, index) => ({ seat, name: `Agent ${index + 1}`, role: roles[index], alive: true }));
}
