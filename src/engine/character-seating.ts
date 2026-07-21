import { SEATS } from '@/domain/constants';
import type { CharacterProfile, CharacterRoster } from '@/domain/characters';
import type { SeatId } from '@/domain/types';
import { stableShuffle } from './prng';

export function assignCharacterSeats(characters: CharacterRoster, seed: string): CharacterRoster {
  if (characters.length !== SEATS.length) throw new Error('CHARACTER_ROSTER_SIZE_INVALID');
  const shuffled = stableShuffle(characters, seed, 'character-seat-assignment');
  const targetBySource = new Map<SeatId, SeatId>(
    shuffled.map((character, index) => [character.seat, SEATS[index]]),
  );

  return shuffled.map((character, index) => {
    const seat = SEATS[index];
    const addressBook = Object.fromEntries(
      Object.entries(character.addressBook).flatMap(([sourceTarget, term]) => {
        const target = targetBySource.get(sourceTarget as SeatId);
        return target && target !== seat ? [[target, term]] : [];
      }),
    ) as CharacterProfile['addressBook'];
    return {
      ...character,
      seat,
      addressBook,
      tts: { ...character.tts, voice: { ...character.tts.voice, seat } },
    };
  });
}
