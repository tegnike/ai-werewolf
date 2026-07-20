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
  const migrationDirectory = path.join(process.cwd(), 'migrations');
  const migrations = fs.readdirSync(migrationDirectory)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right, 'en'));
  for (const file of migrations) {
    const version = Number(file.split('_')[0]);
    if (version !== 1) {
      const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version);
      if (applied) continue;
    }
    db.exec(fs.readFileSync(path.join(migrationDirectory, file), 'utf8'));
    db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(version, new Date().toISOString());
  }
  globalDb.__werewolfDb = db;
  return db;
}

export function closeDatabaseForTests(): void {
  globalDb.__werewolfDb?.close();
  delete globalDb.__werewolfDb;
}
