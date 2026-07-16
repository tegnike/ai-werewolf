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
afterEach(() => {
  closeDatabaseForTests();
  fs.rmSync(directory, { recursive: true, force: true });
  delete process.env.DATABASE_PATH;
  delete process.env.ALLOW_REAL_AI;
  delete process.env.OPENAI_API_KEY;
});

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

  it('旧仕様の1日目dawnを含む中断地点も照合し、重複せず復旧する', async () => {
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
    }, { includeDayOneDawn: true })).rejects.toThrow('simulated crash');
    expect(repo.maxSeq(record.id)).toBe(20);
    expect(repo.events(record.id).some((event) => event.day === 1 && event.type === 'dawn')).toBe(true);
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

  it('APIキーがない実AI試合はDBへrunning状態を残さず作成を拒否する', () => {
    process.env.ALLOW_REAL_AI = '1';
    delete process.env.OPENAI_API_KEY;
    const manager = new MatchRunnerManager();
    expect(() => manager.create({ seed: 'missing-key', speed: 0, ai: 'real' })).toThrow('REAL_AI_NOT_CONFIGURED');
    expect(manager.repo.listMatches()).toHaveLength(0);
  });

  it('停止済みpaused_error試合はretryで新しいRunnerから復旧する', async () => {
    const repo = new MatchRepo();
    const now = new Date().toISOString();
    repo.createMatch({ id: 'retry-match', seed: 'retry', status: 'paused_error', winner: null, speed: 0, apiCalls: 0, error: { code: 'runner_error', message: 'stopped' }, config: { ai: 'mock' }, createdAt: now, updatedAt: now, finishedAt: null });
    const manager = new MatchRunnerManager(repo);
    manager.control('retry-match', 'retry');
    await waitFor(repo, 'retry-match', 'finished');
    expect(repo.events('retry-match').length).toBeGreaterThan(20);
  });
});
