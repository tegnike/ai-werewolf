PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  seed TEXT NOT NULL,
  status TEXT NOT NULL,
  winner TEXT,
  config_json TEXT NOT NULL,
  speed INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  day INTEGER NOT NULL,
  phase TEXT NOT NULL,
  type TEXT NOT NULL,
  visibility TEXT NOT NULL,
  audience_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (match_id, seq)
);

CREATE TABLE IF NOT EXISTS ai_calls (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  call_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('in_flight','ok','failed')),
  response_json TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (match_id, call_key)
);

CREATE INDEX IF NOT EXISTS idx_events_match_seq ON events(match_id, seq);
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC);
