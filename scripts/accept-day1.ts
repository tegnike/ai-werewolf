import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MatchEvent, MatchRecord, QuestionTopic, SeatId, SpeechStructure } from '../src/domain/types';
import { decideClaimPolicies } from '../src/engine/claim-policy';
import { setupPlayers } from '../src/engine/setup';
import { MatchRepo } from '../src/server/repo';
import { MatchRunnerManager } from '../src/server/runner';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

interface SeedCase { seed: string; scenario: string }

function acceptanceSeeds(): SeedCase[] {
  const requested = arg('--seeds', '').split(',').map((value) => value.trim()).filter(Boolean);
  if (requested.length > 0) {
    if (requested.length !== 3) throw new Error('--seeds requires exactly three comma-separated seeds');
    return requested.map((seed, index) => ({ seed, scenario: `requested-${index + 1}` }));
  }
  const found = new Map<string, string>();
  const usedSeeds = new Set<string>();
  for (let index = 0; index < 50_000 && found.size < 3; index += 1) {
    const seed = `day1-v3-${index}`;
    const policies = [...decideClaimPolicies(seed, setupPlayers(seed)).values()];
    const cases: Array<[string, boolean]> = [
      ['madman-seer-opening', policies.some((policy) => policy.actualRole === 'madman' && policy.stance === 'fake' && policy.claimedRole === 'seer' && policy.slot?.day === 1 && policy.slot.stage === 'opening')],
      ['wolf-seer-opening', policies.some((policy) => policy.actualRole === 'werewolf' && policy.stance === 'fake' && policy.claimedRole === 'seer' && policy.slot?.day === 1 && policy.slot.stage === 'opening')],
      ['madman-medium-free', policies.some((policy) => policy.actualRole === 'madman' && policy.stance === 'fake' && policy.claimedRole === 'medium' && policy.slot?.day === 1 && policy.slot.stage === 'free')],
    ];
    const selected = cases.find(([scenario, matches]) => matches && !found.has(scenario) && !usedSeeds.has(seed));
    if (selected) {
      found.set(selected[0], seed);
      usedSeeds.add(seed);
    }
  }
  if (found.size !== 3) throw new Error(`Could not find all acceptance seed classes: ${[...found.keys()].join(',')}`);
  return [...found.entries()].map(([scenario, seed]) => ({ seed, scenario }));
}

function trigrams(value: string): Set<string> {
  const normalized = value.replace(/[\s、。！？,.!?「」『』（）()]/g, '').toLowerCase();
  return new Set(Array.from({ length: Math.max(0, normalized.length - 2) }, (_, index) => normalized.slice(index, index + 3)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  return [...left].filter((value) => right.has(value)).length / union.size;
}

function evaluate(events: MatchEvent[]) {
  const speeches = events.filter((event) => event.day === 1 && event.type === 'discussion_speech');
  const structures = speeches.flatMap((event, speechIndex) => event.payload.structure
    ? [{
        seat: event.payload.seat as SeatId,
        speechIndex,
        requestsReply: Boolean(event.payload.requestsReply),
        structure: event.payload.structure as SpeechStructure,
      }]
    : []);
  const questionCounts: Partial<Record<QuestionTopic, number>> = {};
  for (const { structure, requestsReply } of structures) {
    if (structure.questionTopic && requestsReply) {
      questionCounts[structure.questionTopic] = (questionCounts[structure.questionTopic] ?? 0) + 1;
    }
  }
  const claimedSeats = new Set(speeches.filter((event) => event.payload.claim).map((event) => String(event.payload.seat)));
  const graySuspicions = structures.filter(({ structure }) =>
    structure.suspicion && !claimedSeats.has(structure.suspicion.targetSeat));
  const suspicionSpeakers = new Set(graySuspicions.map(({ seat }) => seat));
  const suspicionTargets = new Set(graySuspicions.flatMap(({ structure }) => structure.suspicion ? [structure.suspicion.targetSeat] : []));
  const voteIntentBySeat = new Map(structures.flatMap(({ seat, structure }) => structure.voteIntent ? [[seat, structure.voteIntent] as const] : []));
  const voteReveal = events.find((event) => event.day === 1 && event.type === 'vote_reveal');
  const votes = (voteReveal?.payload.votes ?? []) as Array<{ voter: SeatId; target: SeatId }>;
  const comparableVotes = votes.filter((vote) => voteIntentBySeat.has(vote.voter));
  const voteConsistency = comparableVotes.length > 0
    ? comparableVotes.filter((vote) => voteIntentBySeat.get(vote.voter) === vote.target).length / comparableVotes.length
    : 0;
  const ordinarySpeeches = speeches.filter((event) => !event.payload.claim);
  const highSimilarityPairs: Array<{ left: number; right: number; score: number }> = [];
  for (let left = 0; left < ordinarySpeeches.length; left += 1) {
    for (let right = left + 1; right < ordinarySpeeches.length; right += 1) {
      const score = jaccard(trigrams(String(ordinarySpeeches[left].payload.speech)), trigrams(String(ordinarySpeeches[right].payload.speech)));
      if (score >= 0.35) highSimilarityPairs.push({ left: Number(ordinarySpeeches[left].payload.turn), right: Number(ordinarySpeeches[right].payload.turn), score: Number(score.toFixed(3)) });
    }
  }
  const hasClaims = claimedSeats.size > 0;
  const roleHeavyBoard = claimedSeats.size >= 3;
  const distinctVoteTargets = new Set(voteIntentBySeat.values());
  const blackBackedTargets = new Set<SeatId>();
  const claimantsByRole = new Map<string, Set<SeatId>>();
  for (const speech of speeches) {
    const claim = speech.payload.claim as { claimedRole?: string; results?: Array<{ targetSeat?: SeatId; verdict?: string }> } | null;
    if (!claim?.claimedRole) continue;
    const claimants = claimantsByRole.get(claim.claimedRole) ?? new Set<SeatId>();
    claimants.add(speech.payload.seat as SeatId);
    claimantsByRole.set(claim.claimedRole, claimants);
    for (const result of claim.results ?? []) {
      if (result.targetSeat && result.verdict === '人狼') blackBackedTargets.add(result.targetSeat);
    }
  }
  const intentTally = new Map<SeatId, number>();
  for (const target of voteIntentBySeat.values()) intentTally.set(target, (intentTally.get(target) ?? 0) + 1);
  const modalIntent = [...intentTally.entries()].sort((a, b) => b[1] - a[1])[0];
  let consensusTarget: SeatId | null = null;
  let consensusStructureIndex = -1;
  const runningIntentBySeat = new Map<SeatId, SeatId>();
  for (let index = 0; index < structures.length; index += 1) {
    const item = structures[index];
    if (!item.structure.voteIntent) continue;
    runningIntentBySeat.set(item.seat, item.structure.voteIntent);
    const count = [...runningIntentBySeat.values()].filter((target) => target === item.structure.voteIntent).length;
    if (count >= 3) {
      consensusTarget = item.structure.voteIntent;
      consensusStructureIndex = index;
      break;
    }
  }
  const postConsensus = consensusStructureIndex >= 0 ? structures.slice(consensusStructureIndex + 1) : [];
  let postConsensusNovelContributions = 0;
  for (const item of postConsensus) {
    const { structure } = item;
    const alternativeSuspicion = Boolean(structure.suspicion && structure.suspicion.targetSeat !== consensusTarget &&
      structure.suspicion.basis !== 'intuition');
    const novel = structure.primaryAct === 'role_claim' || structure.primaryAct === 'answer' ||
      structure.primaryAct === 'defense' || structure.primaryAct === 'board_analysis' || structure.boardAnalysis ||
      (item.requestsReply && structure.questionTopic !== null) || alternativeSuspicion;
    if (novel) postConsensusNovelContributions += 1;
  }
  const requiredNovelContributions = postConsensus.length < 3
    ? Math.min(1, postConsensus.length)
    : Math.ceil((postConsensus.length * 3) / 5);
  const postConsensusNovelty = consensusStructureIndex < 0 || postConsensusNovelContributions >= requiredNovelContributions;
  const postConsensusDuplicateDeclarations = postConsensus.filter(({ structure }) =>
    structure.voteIntent !== null && structure.voteIntent === consensusTarget).length;
  const consensusTargetResponded = consensusStructureIndex < 0 ||
    postConsensus.some(({ seat }) => seat === consensusTarget);
  const voteTally = new Map<SeatId, number>();
  for (const vote of votes) voteTally.set(vote.target, (voteTally.get(vote.target) ?? 0) + 1);
  const topVote = [...voteTally.entries()].sort((a, b) => b[1] - a[1])[0];
  const hasUnopposedBlack = speeches.some((speech) => {
    const claim = speech.payload.claim as { claimedRole?: string; results?: Array<{ verdict?: string }> } | null;
    return Boolean(claim?.claimedRole && claim.results?.some((result) => result.verdict === '人狼') &&
      claimantsByRole.get(claim.claimedRole)?.size === 1);
  });
  const repeatDeclarationDemotions = speeches
    .filter((speech) => speech.payload.contributionDemoted)
    .map((speech) => ({ turn: speech.payload.turn, seat: speech.payload.seat }));
  const roleResolutionBoard = claimedSeats.size >= 4 && blackBackedTargets.size > 0;
  const checks = {
    structureComplete: structures.length === speeches.length,
    repeatedQuestionLimit: Math.max(0, ...Object.values(questionCounts)) <= 2,
    grayReadSpeakers: roleResolutionBoard || suspicionSpeakers.size >= (roleHeavyBoard ? 1 : 3),
    grayReadTargets: roleResolutionBoard || suspicionTargets.size >= (roleHeavyBoard ? 1 : 2),
    voteCommitments: voteIntentBySeat.size >= 2,
    candidateCompetition: voteIntentBySeat.size < 4 || distinctVoteTargets.size >= 2 || Boolean(modalIntent && blackBackedTargets.has(modalIntent[0])),
    postConsensusDeclarationCap: postConsensusDuplicateDeclarations === 0,
    consensusTargetResponse: consensusTargetResponded,
    postConsensusNovelty,
    antiScatterGuard: !hasUnopposedBlack || (topVote?.[1] ?? 0) >= 4,
    boardProgression: !hasClaims || structures.some(({ structure }) => structure.boardAnalysis),
    lowTextRepetition: highSimilarityPairs.filter((pair) => pair.score >= 0.55).length === 0 && highSimilarityPairs.length <= 2,
  };
  return {
    passed: Object.values(checks).every(Boolean), checks, speechCount: speeches.length,
    questionCounts, claimedSeats: [...claimedSeats], suspicionSpeakers: [...suspicionSpeakers],
    suspicionTargets: [...suspicionTargets], voteIntents: Object.fromEntries(voteIntentBySeat),
    blackBackedTargets: [...blackBackedTargets], consensusTarget,
    postConsensusSpeechCount: postConsensus.length,
    postConsensusNovelContributions, requiredNovelContributions, postConsensusDuplicateDeclarations,
    consensusTargetResponded,
    repeatDeclarationDemotions,
    voteConsistency: Number(voteConsistency.toFixed(3)), highSimilarityPairs,
    transcript: speeches.map((event) => ({
      turn: event.payload.turn, name: event.payload.name, speech: event.payload.speech,
      structure: event.payload.structure, claim: event.payload.claim ?? null,
      contributionDemoted: Boolean(event.payload.contributionDemoted),
    })),
  };
}

async function main() {
  if (process.env.ALLOW_REAL_AI !== '1' || !process.env.OPENAI_API_KEY) {
    throw new Error('Real day-one acceptance requires ALLOW_REAL_AI=1 and OPENAI_API_KEY');
  }
  const databasePath = path.resolve(arg('--database', path.join('data', 'day1-acceptance.db')));
  process.env.DATABASE_PATH = databasePath;
  const cases = acceptanceSeeds();
  const repo = new MatchRepo();
  const manager = new MatchRunnerManager(repo);
  const records = cases.map(({ seed, scenario }) => {
    const now = new Date().toISOString();
    const record: MatchRecord = {
      id: randomUUID(), seed, status: 'running', winner: null, speed: 100, apiCalls: 0,
      error: null, config: { ai: 'real' }, createdAt: now, updatedAt: now, finishedAt: null,
    };
    repo.createMatch(record);
    manager.start(record.id);
    return { record, scenario, stopRequested: false };
  });
  process.stdout.write(`Started three concurrent day-one trials: ${records.map((item) => `${item.scenario}=${item.record.id}`).join(', ')}\n`);

  const terminalStatuses = ['finished', 'aborted', 'paused_error', 'aborted_budget'];
  while (records.some((item) => !terminalStatuses.includes(repo.getMatch(item.record.id)?.status ?? ''))) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    for (const item of records) {
      const match = repo.getMatch(item.record.id);
      if (!match) throw new Error(`Match disappeared: ${item.record.id}`);
      if (!item.stopRequested && repo.events(item.record.id).some((event) => event.day === 1 && event.type === 'execution')) {
        item.stopRequested = true;
        manager.control(item.record.id, 'abort');
      }
    }
  }

  const results = records.map((item) => {
    const match = repo.getMatch(item.record.id)!;
    const events = repo.events(item.record.id);
    const reachedExecution = events.some((event) => event.day === 1 && event.type === 'execution');
    return {
      matchId: item.record.id, seed: item.record.seed, scenario: item.scenario,
      status: match.status, apiCalls: match.apiCalls, valid: reachedExecution && !match.error,
      error: match.error, evaluation: evaluate(events),
    };
  });
  const report = {
    generatedAt: new Date().toISOString(), model: 'gpt-5.6-luna', reasoningEffort: 'low',
    databasePath, passed: results.every((result) => result.valid && result.evaluation.passed), results,
  };
  const outputDirectory = path.resolve('tmp', 'day1-acceptance');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\nReport: ${outputPath}\n`);
  process.exit(report.passed ? 0 : 2);
}

void main();
