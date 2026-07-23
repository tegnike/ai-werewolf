import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabaseForTests } from '@/server/db';
import { MatchRepo } from '@/server/repo';
import { MatchRunnerManager } from '@/server/runner';
import { runGame } from '@/engine/game';
import { MockAI } from '@/server/ai/mock';
import { characterAddressTerm } from '@/domain/characters';
import type { MatchEvent, MatchRecord } from '@/domain/types';

let directory = '';
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'werewolf-test-')); process.env.DATABASE_PATH = path.join(directory, 'test.db'); });
afterEach(() => {
  closeDatabaseForTests();
  fs.rmSync(directory, { recursive: true, force: true });
  delete process.env.DATABASE_PATH;
  delete process.env.ALLOW_REAL_AI;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.LLM_PROVIDER;
  delete process.env.GEMINI_MODEL;
  delete process.env.TTS_PROVIDER;
});

async function waitFor(repo: MatchRepo, id: string, status: string) {
  for (let index = 0; index < 300; index += 1) {
    const match = repo.getMatch(id);
    if (match?.status === status) return match;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${status}`);
}

async function waitForEventCount(repo: MatchRepo, id: string, minimum: number) {
  for (let index = 0; index < 300; index += 1) {
    if (repo.events(id).length >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${minimum} events`);
}

describe('MatchRunner', () => {
  it('編集済みキャラを試合開始時にスナップショット保存する', async () => {
    const manager = new MatchRunnerManager();
    const original = manager.repo.characterRoster()[0];
    manager.repo.saveCharacter({ ...original, name: '月城 ニケ' });
    const match = manager.create({ seed: 'character-snapshot', speed: 0, ai: 'mock' });
    expect(match.config.characters?.some((character) => character.name === '月城 ニケ')).toBe(true);
    manager.repo.saveCharacter({ ...original, name: '月城 ニケ改' });
    await waitFor(manager.repo, match.id, 'finished');
    expect(manager.repo.getMatch(match.id)?.config.characters?.some((character) => character.name === '月城 ニケ')).toBe(true);
    const created = manager.repo.events(match.id).find((event) => event.type === 'match_created');
    expect((created?.payload.players as Array<{ name: string }>).some((player) => player.name === '月城 ニケ')).toBe(true);
  });

  it('別キャラクターへ置き換えた保存枠を旧キャラ名で呼ばない', () => {
    const manager = new MatchRunnerManager();
    const original = manager.repo.characterRoster()[1];
    manager.repo.saveCharacter({ ...original, name: 'AIニケちゃん', addressBook: {} });

    const roster = manager.repo.characterRoster();
    const nike = roster.find((character) => character.name === 'AIニケちゃん');
    const makabe = roster.find((character) => character.name === '真壁 陽太');
    expect(nike).toBeDefined();
    expect(makabe?.addressBook[nike!.seat]).toBeUndefined();
    expect(characterAddressTerm(roster, makabe!.seat, nike!.seat)).toBe('AIニケちゃん');
  });

  it('カスタムキャラクターの保存枠を取得できる', () => {
    const repo = new MatchRepo();
    expect(repo.customizedCharacterSeats()).toEqual([]);
    const original = repo.characterRoster()[3];
    repo.saveCharacter({ ...original, name: '共有キャラクター' });
    expect(repo.customizedCharacterSeats()).toEqual(['seat-4']);
    repo.resetCharacter('seat-4');
    expect(repo.customizedCharacterSeats()).toEqual([]);
  });

  it('旧試合スナップショットのフラットな実行設定を排他的形式へ読み替える', () => {
    const repo = new MatchRepo();
    const legacyCharacters = repo.characterRoster().map((character) => {
      const profile = Object.fromEntries(
        Object.entries(character).filter(([key]) => key !== 'llm' && key !== 'tts'),
      );
      return {
        ...profile,
        llmProvider: character.llm.provider,
        openaiReasoningEffort: character.llm.provider === 'openai' ? character.llm.reasoningEffort : 'low',
        geminiThinkingBudget: character.llm.provider === 'gemini' ? character.llm.thinkingBudget : -1,
        ttsProvider: character.tts.provider,
        voice: character.tts.voice,
      };
    });
    const now = new Date().toISOString();
    repo.createMatch({
      id: 'legacy-character-snapshot', seed: 'legacy', status: 'finished', winner: 'village', speed: 0,
      apiCalls: 0, error: null,
      config: { ai: 'mock', characters: legacyCharacters as unknown as NonNullable<MatchRecord['config']['characters']> },
      createdAt: now, updatedAt: now, finishedAt: now,
    });

    const restored = repo.getMatch('legacy-character-snapshot')?.config.characters;
    expect(restored?.[0]).toMatchObject({
      llm: { provider: 'openai', reasoningEffort: 'low' },
      tts: { provider: 'voicevox', voice: { seat: 'seat-1' } },
    });
    expect(restored?.[0]).not.toHaveProperty('llmProvider');
    expect(restored?.[0]).not.toHaveProperty('voice');
  });

  it('選択したLLM・モデル・TTSを試合へスナップショット保存する', async () => {
    process.env.GEMINI_MODEL = 'gemini-test-model';
    const manager = new MatchRunnerManager();
    const original = manager.repo.characterRoster()[0];
    manager.repo.saveCharacter({
      ...original, name: 'Geminiキャラクター',
      llm: { provider: 'gemini', thinkingBudget: 8_192 },
      tts: { provider: 'aivisspeech', voice: { ...original.tts.voice, speakerId: 888753760 } },
    });
    const match = manager.create({ seed: 'provider-snapshot', speed: 0, ai: 'mock' });
    const configured = match.config.characters?.find((character) => character.name === 'Geminiキャラクター');
    expect(configured).toMatchObject({
      llm: { provider: 'gemini', thinkingBudget: 8_192 },
      tts: { provider: 'aivisspeech', voice: { speakerId: 888753760 } },
    });
    expect(match.config.characterLlmModels?.[configured!.seat]).toBe('gemini-test-model');
    await waitFor(manager.repo, match.id, 'finished');
    const saved = manager.repo.getMatch(match.id)?.config.characters?.find((character) => character.name === 'Geminiキャラクター');
    expect(saved).toEqual(configured);
  });

  it('不正な推論設定では試合を作成しない', () => {
    const manager = new MatchRunnerManager();
    expect(() => manager.create({
      seed: 'invalid-reasoning', speed: 0, ai: 'mock', geminiThinkingBudget: 32_769,
    })).toThrow('INVALID_REASONING_CONFIG');
    expect(manager.repo.listMatches()).toHaveLength(0);
  });

  it('MockAIでDBへ一度だけイベントを保存して完走する', async () => {
    const manager = new MatchRunnerManager();
    const match = manager.create({ seed: 'integration', speed: 0, ai: 'mock' });
    const finished = await waitFor(manager.repo, match.id, 'finished');
    expect(finished.apiCalls).toBe(0);
    const events = manager.repo.events(match.id);
    expect(events.length).toBeGreaterThan(20);
    expect(new Set(events.map((event) => event.seq)).size).toBe(events.length);
    expect(events.find((event) => event.type === 'match_created')?.payload.rules).toEqual({ discussion: 'v3', claims: 'v4', nightZero: 'uniform' });
    expect(events.some((event) => event.type === 'discussion_speech' && event.payload.structure)).toBe(true);
  });
  it('pause/resumeとabortを受け付ける', async () => {
    const manager = new MatchRunnerManager();
    const match = manager.create({ seed: 'controls', speed: 30, ai: 'mock' });
    await waitForEventCount(manager.repo, match.id, 1);
    manager.control(match.id, 'pause');
    await waitFor(manager.repo, match.id, 'paused');
    const pausedEventCount = manager.repo.events(match.id).length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(manager.repo.events(match.id)).toHaveLength(pausedEventCount);
    manager.control(match.id, 'resume', 0);
    await waitFor(manager.repo, match.id, 'finished');
    const second = manager.create({ seed: 'abort', speed: 30, ai: 'mock' });
    manager.control(second.id, 'abort');
    await waitFor(manager.repo, second.id, 'aborted');
  });

  it('実行中runnerが見つからない試合もabortで即時に強制終了する', () => {
    const repo = new MatchRepo();
    const now = new Date().toISOString();
    const record: MatchRecord = { id: 'orphaned-running-match', seed: 'orphaned', status: 'running', winner: null, speed: 0, apiCalls: 0, error: null, config: { ai: 'mock' }, createdAt: now, updatedAt: now, finishedAt: null };
    repo.createMatch(record);
    const manager = new MatchRunnerManager(repo);

    manager.control(record.id, 'abort');

    expect(repo.getMatch(record.id)?.status).toBe('aborted');
    expect(repo.getMatch(record.id)?.finishedAt).not.toBeNull();
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
    }, { includeDayOneDawn: true, discussionVersion: 'legacy', nightZeroMode: 'ai' })).rejects.toThrow('simulated crash');
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

  it('claims v1の公開主張後も同じイベント列を再導出して復旧する', async () => {
    const repo = new MatchRepo();
    const now = new Date().toISOString();
    const record: MatchRecord = { id: 'claims-recovery', seed: '1000', status: 'running', winner: null, speed: 0, apiCalls: 0, error: null, config: { ai: 'mock' }, createdAt: now, updatedAt: now, finishedAt: null };
    repo.createMatch(record);
    let seq = 0;
    await expect(runGame(record.id, record.seed, new MockAI(), {
      emit: async (draft) => {
        repo.appendEvent({ ...draft, matchId: record.id, seq: ++seq, createdAt: now });
      },
      checkpoint: async () => { if (seq === 32) throw new Error('simulated claims crash'); },
    }, { claimsVersion: 'v1', discussionVersion: 'v2', nightZeroMode: 'ai' })).rejects.toThrow('simulated claims crash');
    expect(repo.events(record.id).find((event) => event.type === 'match_created')?.payload.rules).toEqual({ discussion: 'v2', claims: 'v1' });
    expect(repo.events(record.id).some((event) => event.type === 'discussion_speech' && event.payload.claim)).toBe(true);

    const manager = new MatchRunnerManager(repo);
    manager.recover();
    await waitFor(repo, record.id, 'finished');
    const events = repo.events(record.id);
    expect(events.map((event) => event.seq)).toEqual(Array.from({ length: events.length }, (_, index) => index + 1));
  });

  it('新規claims v2の公開主張後も同じversionで復旧する', async () => {
    const repo = new MatchRepo();
    const now = new Date().toISOString();
    const record: MatchRecord = { id: 'claims-v2-recovery', seed: '1001', status: 'running', winner: null, speed: 0, apiCalls: 0, error: null, config: { ai: 'mock' }, createdAt: now, updatedAt: now, finishedAt: null };
    repo.createMatch(record);
    let seq = 0;
    await expect(runGame(record.id, record.seed, new MockAI(), {
      emit: async (draft) => {
        repo.appendEvent({ ...draft, matchId: record.id, seq: ++seq, createdAt: now });
      },
      checkpoint: async () => { if (seq === 32) throw new Error('simulated claims v2 crash'); },
    }, { claimsVersion: 'v2', discussionVersion: 'v3', nightZeroMode: 'uniform' })).rejects.toThrow('simulated claims v2 crash');
    expect(repo.events(record.id).find((event) => event.type === 'match_created')?.payload.rules)
      .toEqual({ discussion: 'v3', claims: 'v2', nightZero: 'uniform' });

    const manager = new MatchRunnerManager(repo);
    manager.recover();
    await waitFor(repo, record.id, 'finished');
    const events = repo.events(record.id);
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

  it('Gemini選択時はGemini APIキーだけを起動条件として検査する', () => {
    process.env.ALLOW_REAL_AI = '1';
    process.env.OPENAI_API_KEY = 'openai-test-key';
    delete process.env.GEMINI_API_KEY;
    const manager = new MatchRunnerManager();
    expect(() => manager.create({
      seed: 'missing-gemini-key', speed: 0, ai: 'real', llmProvider: 'gemini',
    })).toThrow('REAL_AI_NOT_CONFIGURED');
    expect(manager.repo.listMatches()).toHaveLength(0);
  });

  it('キャラクターごとに必要なすべてのLLM APIキーを起動条件として検査する', () => {
    process.env.ALLOW_REAL_AI = '1';
    process.env.OPENAI_API_KEY = 'openai-test-key';
    delete process.env.GEMINI_API_KEY;
    const manager = new MatchRunnerManager();
    const original = manager.repo.characterRoster()[0];
    manager.repo.saveCharacter({ ...original, name: 'Gemini担当', llm: { provider: 'gemini', thinkingBudget: -1 } });
    expect(() => manager.create({ seed: 'mixed-provider-keys', speed: 0, ai: 'real' })).toThrow('REAL_AI_NOT_CONFIGURED');
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
