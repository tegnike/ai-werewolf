import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabaseForTests } from '@/server/db';
import { MatchRepo } from '@/server/repo';
import { MatchRunnerManager } from '@/server/runner';
import { runGame } from '@/engine/game';
import { MockAI } from '@/server/ai/mock';
import type { MatchEvent, MatchRecord } from '@/domain/types';

let directory = '';
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'werewolf-test-')); process.env.DATABASE_PATH = path.join(directory, 'test.db'); });
afterEach(() => { closeDatabaseForTests(); fs.rmSync(directory, { recursive: true, force: true }); delete process.env.DATABASE_PATH; });

async function waitFor(repo: MatchRepo, id: string, status: string) {
  for (let index = 0; index < 300; index += 1) {
    const match = repo.getMatch(id);
    if (match?.status === status) return match;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${status}`);
}

describe('MatchRunner', () => {
  it('MockAIでDBへ一度だけイベントを保存して完走する', async () => {
    const manager = new MatchRunnerManager();
    const match = manager.create({ seed: 'integration', speed: 0, ai: 'mock' });
    const finished = await waitFor(manager.repo, match.id, 'finished');
    expect(finished.apiCalls).toBe(0);
    const events = manager.repo.events(match.id);
    expect(events.length).toBeGreaterThan(20);
    expect(new Set(events.map((event) => event.seq)).size).toBe(events.length);
  });
  it('pause/resumeとabortを受け付ける', async () => {
    const manager = new MatchRunnerManager();
    const match = manager.create({ seed: 'controls', speed: 30, ai: 'mock' });
    manager.control(match.id, 'pause');
    await waitFor(manager.repo, match.id, 'paused');
    manager.control(match.id, 'resume', 0);
    await waitFor(manager.repo, match.id, 'finished');
    const second = manager.create({ seed: 'abort', speed: 30, ai: 'mock' });
    manager.control(second.id, 'abort');
    await waitFor(manager.repo, second.id, 'aborted');
  });

  it('中断地点まで既存イベントを照合し、重複せず復旧する', async () => {
    const repo = new MatchRepo();
    const now = new Date().toISOString();
    const record: MatchRecord = { id: 'recovery-match', seed: 'recovery', status: 'running', winner: null, speed: 0, apiCalls: 0, error: null, config: { ai: 'mock' }, createdAt: now, updatedAt: now, finishedAt: null };
    repo.createMatch(record);
    let seq = 0;
    await expect(runGame(record.id, record.seed, new MockAI(), {
      emit: async (draft) => {
        const event: MatchEvent = { ...draft, matchId: record.id, seq: ++seq, createdAt: now };
        repo.appendEvent(event);
      },
      checkpoint: async () => { if (seq === 20) throw new Error('simulated crash'); },
    })).rejects.toThrow('simulated crash');
    expect(repo.maxSeq(record.id)).toBe(20);
    const manager = new MatchRunnerManager(repo);
    manager.recover();
    await waitFor(repo, record.id, 'finished');
    const events = repo.events(record.id);
    expect(events.length).toBeGreaterThan(20);
    expect(new Set(events.map((event) => event.seq)).size).toBe(events.length);
    expect(events.map((event) => event.seq)).toEqual(Array.from({ length: events.length }, (_, index) => index + 1));
  });

  it('一時停止中の試合を再起動時に勝手に再開しない', async () => {
    const repo = new MatchRepo();
    const now = new Date().toISOString();
    const record: MatchRecord = { id: 'paused-match', seed: 'paused', status: 'paused', winner: null, speed: 0, apiCalls: 0, error: null, config: { ai: 'mock' }, createdAt: now, updatedAt: now, finishedAt: null };
    repo.createMatch(record);
    const manager = new MatchRunnerManager(repo);
    manager.recover();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(repo.getMatch(record.id)?.status).toBe('paused');
    expect(repo.events(record.id)).toHaveLength(0);
    manager.control(record.id, 'resume');
    await waitFor(repo, record.id, 'finished');
  });
});
