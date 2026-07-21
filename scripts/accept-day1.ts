import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { claimLedgerFromEvents } from '../src/domain/claims';
import type { MatchEvent, MatchRecord, SeatId, SpeechStructure } from '../src/domain/types';
import { decideClaimPolicies } from '../src/engine/claim-policy';
import { candidateEvidenceLedger, emptyDiscussionBoard, foldDiscussionBoard } from '../src/engine/discussion-board';
import { setupPlayers } from '../src/engine/setup';
import { closeDatabaseForTests } from '../src/server/db';
import { MatchRepo } from '../src/server/repo';
import { MatchRunnerManager } from '../src/server/runner';
import {
  configuredLlmProvider, DEFAULT_GEMINI_THINKING_BUDGET, DEFAULT_OPENAI_REASONING_EFFORT, hasApiKey, modelForProvider,
} from '../src/server/ai/provider';
import { projectEvents } from '../src/server/view';

interface SeedCase { seed: string; scenario: string }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function arg(name: string, fallback = ''): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function mainWorktreeRoot(projectRoot: string): string {
  try {
    const commonGitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return path.dirname(commonGitDir);
  } catch {
    return projectRoot;
  }
}

function loadRuntimeEnvironment(projectRoot: string): string {
  const localEnv = path.join(projectRoot, '.env.local');
  const sharedEnv = path.join(mainWorktreeRoot(projectRoot), '.env.local');
  const source = fs.existsSync(localEnv) ? localEnv : fs.existsSync(sharedEnv) ? sharedEnv : null;
  if (source) process.loadEnvFile(source);
  return source ? path.relative(projectRoot, source) || '.env.local' : 'process environment';
}

function requireRealAI(): void {
  if (arg('--ai') !== 'real') throw new Error('Day-one replay requires the explicit --ai real flag');
  if (process.env.ALLOW_REAL_AI !== '1') throw new Error('Day-one replay requires ALLOW_REAL_AI=1');
  const provider = configuredLlmProvider();
  if (!hasApiKey(provider)) throw new Error(`Day-one replay requires ${provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'}`);
}

function defaultSeedCases(): SeedCase[] {
  const found = new Map<string, string>();
  const usedSeeds = new Set<string>();
  for (let index = 0; index < 50_000 && found.size < 3; index += 1) {
    const seed = `day1-v3-${index}`;
    const policies = [...decideClaimPolicies(seed, setupPlayers(seed), 'v2').values()];
    const cases: Array<[string, boolean]> = [
      ['madman-seer-opening', policies.some((policy) =>
        policy.actualRole === 'madman' && policy.stance === 'fake' && policy.claimedRole === 'seer' &&
        policy.slot?.day === 1 && policy.slot.stage === 'opening')],
      ['wolf-seer-opening', policies.some((policy) =>
        policy.actualRole === 'werewolf' && policy.stance === 'fake' && policy.claimedRole === 'seer' &&
        policy.slot?.day === 1 && policy.slot.stage === 'opening')],
      ['madman-medium-free', policies.some((policy) =>
        policy.actualRole === 'madman' && policy.stance === 'fake' && policy.claimedRole === 'medium' &&
        policy.slot?.day === 1 && policy.slot.stage === 'free')],
    ];
    const selected = cases.find(([scenario, matches]) => matches && !found.has(scenario) && !usedSeeds.has(seed));
    if (selected) {
      found.set(selected[0], seed);
      usedSeeds.add(seed);
    }
  }
  if (found.size !== 3) throw new Error(`Could not find all day-one seed classes: ${[...found.keys()].join(',')}`);
  return [...found.entries()].map(([scenario, seed]) => ({ seed, scenario }));
}

function requestedSeedCases(): SeedCase[] {
  const single = arg('--seed').trim();
  if (single) return [{ seed: single, scenario: 'requested' }];
  const seeds = arg('--seeds').split(',').map((value) => value.trim()).filter(Boolean);
  if (seeds.length > 0) {
    if (seeds.length > 3) throw new Error('--seeds accepts at most three comma-separated seeds');
    return seeds.map((seed, index) => ({ seed, scenario: `requested-${index + 1}` }));
  }
  return defaultSeedCases();
}

function resultEvents(events: MatchEvent[]) {
  return projectEvents(events, 'public').filter((event) => event.day <= 1 && [
    'discussion_speech', 'discussion_closed', 'vote_reveal', 'execution', 'private_action',
  ].includes(event.type));
}

function dayOneMetrics(events: MatchEvent[]) {
  const speeches = events.filter((event) => event.visibility === 'public' &&
    event.day === 1 && event.type === 'discussion_speech');
  let board = emptyDiscussionBoard();
  for (const event of speeches) {
    const seat = event.payload.seat;
    const structure = event.payload.structure;
    if (typeof seat !== 'string' || !structure || typeof structure !== 'object') continue;
    board = foldDiscussionBoard(
      board,
      seat as SeatId,
      structure as SpeechStructure,
      event.payload.requestsReply === true,
    );
  }
  const candidateEvidence = candidateEvidenceLedger(board, claimLedgerFromEvents(events))
    .map((entry) => ({
      targetSeat: entry.targetSeat,
      suspicionSpeakers: entry.suspicionSpeakers,
      voteIntentSpeakers: entry.voteIntentSpeakers,
      distinctBases: entry.distinctBases,
      suspicionBases: entry.suspicionBases,
      echoSpeakers: entry.echoSpeakers,
      claimedResultCount: entry.claimedResults.length,
    }));
  const voteReveal = events.find((event) => event.visibility === 'public' &&
    event.day === 1 && event.type === 'vote_reveal');
  const tally = voteReveal?.payload.tally && typeof voteReveal.payload.tally === 'object'
    ? Object.values(voteReveal.payload.tally as Record<string, unknown>).map(Number).filter(Number.isFinite)
    : [];
  const speakerSeats = speeches.map((event) => event.payload.seat).filter((seat): seat is string => typeof seat === 'string');
  const speakerSpacingViolations = speakerSeats.filter((seat, index) =>
    speakerSeats.slice(Math.max(0, index - 2), index).includes(seat)).length;
  const maxVotes = tally.length > 0 ? Math.max(...tally) : 0;
  const voteReasonSanitizations = events.filter((event) => event.type === 'vote_reveal')
    .flatMap((event) => Array.isArray(event.payload.votes) ? event.payload.votes as Array<Record<string, unknown>> : [])
    .filter((vote) => vote.reasonSanitized === true).length;
  return {
    speechCount: speeches.length,
    speakerSpacingViolations,
    maxVoteShare: tally.length > 0 ? Number((maxVotes / tally.reduce((sum, count) => sum + count, 0)).toFixed(3)) : null,
    candidatesWithAtLeastTwoVotes: tally.filter((count) => count >= 2).length,
    voteReasonSanitizations,
    candidateEvidence,
  };
}

async function runCase(
  manager: MatchRunnerManager,
  repo: MatchRepo,
  seedCase: SeedCase,
): Promise<{
  match: MatchRecord;
  scenario: string;
  reachedDayOneExecution: boolean;
  runnerError: MatchRecord['error'];
  events: ReturnType<typeof resultEvents>;
}> {
  const match = manager.create({ seed: seedCase.seed, speed: 1500, ai: 'real', llmProvider: configuredLlmProvider() });
  let reachedDayOneExecution = false;
  let runnerError: MatchRecord['error'] = null;
  let abortRequested = false;

  while (true) {
    await wait(50);
    const current = repo.getMatch(match.id);
    if (!current) throw new Error(`Match disappeared: ${match.id}`);
    const events = repo.events(match.id);
    reachedDayOneExecution = events.some((event) => event.day === 1 && event.type === 'execution');
    if (current.status === 'paused_error') {
      runnerError = current.error;
      if (!abortRequested) {
        abortRequested = true;
        manager.control(match.id, 'abort');
      }
    } else if (reachedDayOneExecution && !abortRequested) {
      abortRequested = true;
      manager.control(match.id, 'abort');
    }
    if (['finished', 'aborted', 'aborted_budget'].includes(current.status)) {
      return {
        match: current,
        scenario: seedCase.scenario,
        reachedDayOneExecution,
        runnerError: runnerError ?? current.error,
        events: resultEvents(events),
      };
    }
  }
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const environmentSource = loadRuntimeEnvironment(projectRoot);
  requireRealAI();

  const generatedAt = new Date();
  const runId = generatedAt.toISOString().replace(/[:.]/g, '-');
  const outputDirectory = path.resolve(arg('--output-directory', path.join('tmp', 'day1-replay')));
  fs.mkdirSync(outputDirectory, { recursive: true });
  const databasePath = path.resolve(arg('--database', path.join(outputDirectory, `${runId}.db`)));
  const resultPath = path.join(outputDirectory, `${runId}.json`);
  process.env.DATABASE_PATH = databasePath;

  const repo = new MatchRepo();
  const manager = new MatchRunnerManager(repo);
  const cases = requestedSeedCases();
  const results = [];
  for (const seedCase of cases) {
    process.stdout.write(`Running day one: ${seedCase.scenario} seed=${seedCase.seed}\n`);
    const result = await runCase(manager, repo, seedCase);
    results.push(result);
    process.stdout.write(`Captured: match=${result.match.id} status=${result.match.status} apiCalls=${result.match.apiCalls}\n`);
  }

  const report = {
    artifactType: 'day-one-replay-result',
    generatedAt: generatedAt.toISOString(),
    runtime: {
      ai: 'real', llmProvider: configuredLlmProvider(), model: modelForProvider(configuredLlmProvider()), environmentSource,
      openaiReasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
      geminiThinkingBudget: DEFAULT_GEMINI_THINKING_BUDGET,
      discussionVersion: 'v3', claimsVersion: 'v2', stopAfter: 'day-one execution',
      nightZeroMode: 'uniform',
    },
    databasePath,
    results: results.map((result) => ({
      matchId: result.match.id,
      seed: result.match.seed,
      scenario: result.scenario,
      status: result.match.status,
      apiCalls: result.match.apiCalls,
      reachedDayOneExecution: result.reachedDayOneExecution,
      error: result.runnerError,
      metrics: dayOneMetrics(repo.events(result.match.id)),
      events: result.events,
    })),
  };

  fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  closeDatabaseForTests();
  if (fs.existsSync(databasePath)) fs.chmodSync(databasePath, 0o600);
  process.stdout.write(`Result artifact: ${resultPath}\nDatabase artifact: ${databasePath}\n`);
  if (results.some((result) => !result.reachedDayOneExecution || result.runnerError)) process.exitCode = 2;
}

void main();
