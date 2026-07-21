import type Database from 'better-sqlite3';
import { MAX_API_CALLS, SEATS } from '@/domain/constants';
import type { MatchEvent, MatchRecord, MatchStatus, SeatId, Winner } from '@/domain/types';
import {
  characterProfileSchema, cloneDefaultCharacterRoster, withoutReplacedCharacterDefaultAddresses,
  type CharacterProfile, type CharacterRoster,
} from '@/domain/characters';
import { getDatabase } from './db';

interface MatchRow {
  id: string; seed: string; status: MatchStatus; winner: Winner | null; config_json: string; speed: number;
  api_calls: number; error_json: string | null; created_at: string; updated_at: string; finished_at: string | null;
}
interface EventRow {
  match_id: string; seq: number; day: number; phase: MatchEvent['phase']; type: string;
  visibility: MatchEvent['visibility']; audience_json: string; payload_json: string; created_at: string;
}
export interface AiCallRecord {
  matchId: string; callKey: string; requestHash: string; status: 'in_flight' | 'ok' | 'failed';
  response: unknown; attempts: number; requestId: string | null;
}

function mapMatch(row: MatchRow): MatchRecord {
  const config = JSON.parse(row.config_json) as MatchRecord['config'];
  if (Array.isArray(config.characters)) {
    const normalized = config.characters.map((character) => characterProfileSchema.safeParse(character));
    if (normalized.every((result) => result.success)) {
      config.characters = normalized.map((result) => result.data);
    }
  }
  return {
    id: row.id, seed: row.seed, status: row.status, winner: row.winner, speed: row.speed,
    apiCalls: row.api_calls, error: row.error_json ? JSON.parse(row.error_json) : null,
    config, createdAt: row.created_at, updatedAt: row.updated_at, finishedAt: row.finished_at,
  };
}
function mapEvent(row: EventRow): MatchEvent {
  return {
    matchId: row.match_id, seq: row.seq, day: row.day, phase: row.phase, type: row.type,
    visibility: row.visibility, audienceSeats: JSON.parse(row.audience_json), payload: JSON.parse(row.payload_json), createdAt: row.created_at,
  };
}

export class MatchRepo {
  constructor(private readonly db: Database.Database = getDatabase()) {}

  createMatch(record: MatchRecord): void {
    this.db.prepare(`INSERT INTO matches(id,seed,status,winner,config_json,speed,api_calls,error_json,created_at,updated_at,finished_at)
      VALUES(@id,@seed,@status,@winner,@config,@speed,@apiCalls,@error,@createdAt,@updatedAt,@finishedAt)`).run({
      ...record, config: JSON.stringify(record.config), error: record.error ? JSON.stringify(record.error) : null,
    });
  }

  listMatches(): MatchRecord[] {
    return (this.db.prepare('SELECT * FROM matches ORDER BY created_at DESC LIMIT 100').all() as MatchRow[]).map(mapMatch);
  }

  getMatch(id: string): MatchRecord | null {
    const row = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
    return row ? mapMatch(row) : null;
  }

  characterRoster(): CharacterRoster {
    const roster = cloneDefaultCharacterRoster();
    const rows = this.db.prepare('SELECT seat, config_json FROM character_presets').all() as Array<{ seat: string; config_json: string }>;
    for (const row of rows) {
      const parsed = characterProfileSchema.safeParse(JSON.parse(row.config_json));
      if (!parsed.success) continue;
      const index = roster.findIndex((profile) => profile.seat === parsed.data.seat);
      if (index >= 0) roster[index] = parsed.data;
    }
    return withoutReplacedCharacterDefaultAddresses(roster);
  }

  customizedCharacterSeats(): SeatId[] {
    return (this.db.prepare('SELECT seat FROM character_presets ORDER BY seat').all() as Array<{ seat: string }>)
      .map((row) => row.seat)
      .filter((seat): seat is SeatId => SEATS.includes(seat as SeatId));
  }

  saveCharacter(profile: CharacterProfile): CharacterProfile {
    const parsed = characterProfileSchema.parse(profile);
    const roster = this.characterRoster();
    const duplicate = roster.some((item) => item.seat !== parsed.seat && item.name === parsed.name);
    if (duplicate) throw new Error('CHARACTER_NAME_DUPLICATE');
    this.db.prepare(`INSERT INTO character_presets(seat,config_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(seat) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at`)
      .run(parsed.seat, JSON.stringify(parsed), new Date().toISOString());
    return parsed;
  }

  resetCharacter(seat: string): CharacterProfile {
    const profile = cloneDefaultCharacterRoster().find((item) => item.seat === seat);
    if (!profile) throw new Error('CHARACTER_NOT_FOUND');
    this.db.prepare('DELETE FROM character_presets WHERE seat=?').run(seat);
    return profile;
  }

  updateStatus(id: string, status: MatchStatus, winner: Winner | null = null, error: MatchRecord['error'] = null): void {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE matches SET status=?, winner=COALESCE(?,winner), error_json=?, updated_at=?,
      finished_at=CASE WHEN ? IN ('finished','aborted','aborted_budget') THEN ? ELSE finished_at END WHERE id=?`)
      .run(status, winner, error ? JSON.stringify(error) : null, now, status, now, id);
  }

  updateSpeed(id: string, speed: number): void {
    this.db.prepare('UPDATE matches SET speed=?, updated_at=? WHERE id=?').run(speed, new Date().toISOString(), id);
  }

  appendEvent(event: MatchEvent): void {
    this.db.prepare(`INSERT INTO events(match_id,seq,day,phase,type,visibility,audience_json,payload_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      event.matchId, event.seq, event.day, event.phase, event.type, event.visibility,
      JSON.stringify(event.audienceSeats), JSON.stringify(event.payload), event.createdAt,
    );
  }

  events(id: string, fromSeq = 0): MatchEvent[] {
    return (this.db.prepare('SELECT * FROM events WHERE match_id=? AND seq>? ORDER BY seq').all(id, fromSeq) as EventRow[]).map(mapEvent);
  }

  maxSeq(id: string): number {
    return (this.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM events WHERE match_id=?').get(id) as { seq: number }).seq;
  }

  getAiCall(matchId: string, callKey: string): AiCallRecord | null {
    const row = this.db.prepare('SELECT * FROM ai_calls WHERE match_id=? AND call_key=?').get(matchId, callKey) as {
      match_id: string; call_key: string; request_hash: string; status: AiCallRecord['status']; response_json: string | null; attempts: number; request_id: string | null;
    } | undefined;
    return row ? {
      matchId: row.match_id, callKey: row.call_key, requestHash: row.request_hash, status: row.status,
      response: row.response_json ? JSON.parse(row.response_json) : null, attempts: row.attempts, requestId: row.request_id,
    } : null;
  }

  beginAiAttempt(matchId: string, callKey: string, requestHash: string): number {
    return this.db.transaction(() => {
      const match = this.getMatch(matchId);
      if (!match || match.apiCalls >= MAX_API_CALLS) throw new Error('API_BUDGET_EXCEEDED');
      const now = new Date().toISOString();
      this.db.prepare('UPDATE matches SET api_calls=api_calls+1, updated_at=? WHERE id=?').run(now, matchId);
      this.db.prepare(`INSERT INTO ai_calls(match_id,call_key,request_hash,status,response_json,attempts,request_id,created_at,updated_at)
        VALUES(?,?,?,'in_flight',NULL,1,NULL,?,?)
        ON CONFLICT(match_id,call_key) DO UPDATE SET request_hash=excluded.request_hash, status='in_flight', attempts=attempts+1, updated_at=excluded.updated_at`)
        .run(matchId, callKey, requestHash, now, now);
      return match.apiCalls + 1;
    })();
  }

  completeAiCall(matchId: string, callKey: string, response: unknown, requestId: string | null): void {
    this.db.prepare("UPDATE ai_calls SET status='ok', response_json=?, request_id=?, updated_at=? WHERE match_id=? AND call_key=?")
      .run(JSON.stringify(response), requestId, new Date().toISOString(), matchId, callKey);
  }

  failAiCall(matchId: string, callKey: string, requestId: string | null): void {
    this.db.prepare("UPDATE ai_calls SET status='failed', request_id=?, updated_at=? WHERE match_id=? AND call_key=?")
      .run(requestId, new Date().toISOString(), matchId, callKey);
  }

  hasInFlightCalls(matchId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM ai_calls WHERE match_id=? AND status='in_flight' LIMIT 1").get(matchId));
  }
}
