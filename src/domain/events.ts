import type { MatchEvent, Phase, SeatId, Visibility } from './types';

export type EventDraft = Omit<MatchEvent, 'matchId' | 'seq' | 'createdAt'>;

export function eventDraft(
  day: number,
  phase: Phase,
  type: string,
  payload: Record<string, unknown>,
  visibility: Visibility = 'public',
  audienceSeats: SeatId[] = [],
): EventDraft {
  return { day, phase, type, payload, visibility, audienceSeats };
}
