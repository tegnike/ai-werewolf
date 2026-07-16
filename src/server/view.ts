import type { MatchEvent, MatchRecord, ViewMode } from '@/domain/types';

export interface PublicEvent {
  matchId: string; seq: number; day: number; phase: string; type: string; payload: Record<string, unknown>; createdAt: string;
}

export function projectEvents(events: MatchEvent[], view: ViewMode): Array<MatchEvent | PublicEvent> {
  if (view === 'gm') return events;
  return events.filter((event) => event.visibility === 'public').map((event) => ({
    matchId: event.matchId, seq: event.seq, day: event.day, phase: event.phase,
    type: event.type, payload: event.payload, createdAt: event.createdAt,
  }));
}

export function projectMatch(match: MatchRecord, view: ViewMode) {
  const common = {
    id: match.id, seed: match.seed, status: match.status, winner: match.winner, speed: match.speed,
    apiCalls: match.apiCalls, error: match.error, createdAt: match.createdAt, updatedAt: match.updatedAt, finishedAt: match.finishedAt,
  };
  return view === 'gm' ? { ...common, ai: match.config.ai } : common;
}
