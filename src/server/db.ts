import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const globalDb = globalThis as typeof globalThis & { __werewolfDb?: Database.Database };

export function getDatabase(): Database.Database {
  if (globalDb.__werewolfDb) return globalDb.__werewolfDb;
  const databasePath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'ai-werewolf.db');
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const migration = fs.readFileSync(path.join(process.cwd(), 'migrations', '001_init.sql'), 'utf8');
  db.exec(migration);
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)').run(new Date().toISOString());
  globalDb.__werewolfDb = db;
  return db;
}

export function closeDatabaseForTests(): void {
  globalDb.__werewolfDb?.close();
  delete globalDb.__werewolfDb;
}
