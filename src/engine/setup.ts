import { ROLE_DECK, SEATS } from '@/domain/constants';
import { agentNameForSeat } from '@/domain/agents';
import type { Player } from '@/domain/types';
import { stableShuffle } from './prng';

export function setupPlayers(seed: string): Player[] {
  const roles = stableShuffle(ROLE_DECK, seed, 'role-deck');
  return SEATS.map((seat, index) => ({ seat, name: agentNameForSeat(seat), role: roles[index], alive: true }));
}
