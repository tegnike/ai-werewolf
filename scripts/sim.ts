import { randomUUID } from 'node:crypto';
import type { MatchRecord } from '../src/domain/types';
import { MatchRepo } from '../src/server/repo';
import { MatchRunnerManager } from '../src/server/runner';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function main() {
  const matches = Number(arg('--matches', '1'));
  const ai = arg('--ai', 'mock') as 'mock' | 'real';
  const seedBase = Number(arg('--seed-base', '1000'));
  if (ai === 'real' && process.env.ALLOW_REAL_AI !== '1') throw new Error('Real AI requires --ai real and ALLOW_REAL_AI=1');
  const repo = new MatchRepo();
  const manager = new MatchRunnerManager(repo);

  for (let index = 0; index < matches; index += 1) {
    const now = new Date().toISOString();
    const record: MatchRecord = {
      id: randomUUID(), seed: String(seedBase + index), status: 'running', winner: null, speed: 0, apiCalls: 0,
      error: null, config: { ai }, createdAt: now, updatedAt: now, finishedAt: null,
    };
    repo.createMatch(record);
    manager.start(record.id);
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const current = repo.getMatch(record.id);
      if (!current) throw new Error('Match disappeared');
      if (current.status === 'finished') {
        console.log(`${index + 1}/${matches} seed=${record.seed} winner=${current.winner} events=${repo.maxSeq(record.id)} apiCalls=${current.apiCalls}`);
        break;
      }
      if (['paused_error', 'aborted', 'aborted_budget'].includes(current.status)) {
        throw new Error(`Match ${record.id} stopped: ${JSON.stringify(current.error)}`);
      }
    }
  }
}

void main();
