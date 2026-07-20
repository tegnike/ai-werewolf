import { ROLE_DECK, SEATS } from '@/domain/constants';
import { agentNameForSeat } from '@/domain/agents';
import type { Player } from '@/domain/types';
import type { CharacterRoster } from '@/domain/characters';
import { characterNameForSeat } from '@/domain/characters';
import { stableShuffle } from './prng';

export function setupPlayers(seed: string, characters?: CharacterRoster): Player[] {
  const roles = stableShuffle(ROLE_DECK, seed, 'role-deck');
  return SEATS.map((seat, index) => ({ seat, name: characters ? characterNameForSeat(characters, seat) : agentNameForSeat(seat), role: roles[index], alive: true }));
}
