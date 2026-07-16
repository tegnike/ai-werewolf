import type { MatchEvent, MatchRecord, ViewMode } from '@/domain/types';

export interface PublicEvent {
  matchId: string; seq: number; day: number; phase: string; type: string; payload: Record<string, unknown>; createdAt: string;
}

function publicPayload(event: MatchEvent): Record<string, unknown> {
  const payload = event.payload;
  const fields: Record<string, string[]> = {
    dawn: ['victim', 'message'],
    discussion_speech: ['seat', 'name', 'round', 'speech'],
    execution: ['seat', 'message'],
    anomaly_flag: ['winner', 'roles', 'anomaly'],
    match_finished: ['winner', 'roles', 'anomaly'],
  };

  if (event.type === 'vote_reveal') {
    const votes = Array.isArray(payload.votes)
      ? payload.votes.flatMap((vote) => {
        if (!vote || typeof vote !== 'object') return [];
        const item = vote as Record<string, unknown>;
        return typeof item.voter === 'string' && typeof item.target === 'string'
          ? [{ voter: item.voter, target: item.target }]
          : [];
      })
      : [];
    return { round: payload.round, votes, tally: payload.tally };
  }

  return Object.fromEntries((fields[event.type] ?? []).flatMap((key) => key in payload ? [[key, payload[key]]] : []));
}

export function projectEvents(events: MatchEvent[], view: ViewMode, revealSecrets = false): Array<MatchEvent | PublicEvent> {
  // 修正前に保存された試合にも第0夜明けのdawnイベントが残っているため、
  // 新規生成の防止だけでなくAPI射影でも1日目の夜明けを除外する。
  const presentable = events.filter((event) => !(event.day === 1 && event.type === 'dawn'));
  if (view === 'gm' || revealSecrets) return presentable;
  return presentable.filter((event) => event.visibility === 'public').map((event) => ({
    matchId: event.matchId, seq: event.seq, day: event.day, phase: event.phase,
    type: event.type, payload: publicPayload(event), createdAt: event.createdAt,
  }));
}

export function projectMatch(match: MatchRecord, view: ViewMode) {
  const common = {
    id: match.id, seed: match.seed, status: match.status, winner: match.winner, speed: match.speed,
    apiCalls: match.apiCalls, error: match.error, createdAt: match.createdAt, updatedAt: match.updatedAt, finishedAt: match.finishedAt,
  };
  return view === 'gm' ? { ...common, ai: match.config.ai } : common;
}
