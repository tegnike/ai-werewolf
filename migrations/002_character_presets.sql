CREATE TABLE IF NOT EXISTS character_presets (
  seat TEXT PRIMARY KEY CHECK(seat IN ('seat-1','seat-2','seat-3','seat-4','seat-5','seat-6','seat-7','seat-8','seat-9')),
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
