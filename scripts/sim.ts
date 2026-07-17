import { randomUUID } from 'node:crypto';
import { claimLedgerFromEvents } from '../src/domain/claims';
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
  const claimMetrics = {
    matches: 0,
    trueSeerClaims: 0,
    trueSeerDayOneClaims: 0,
    counterclaimMatches: 0,
    loneTrueSeerMatches: 0,
    loneSeerClaimMatches: 0,
    loneSeerClaimWasTrueMatches: 0,
    fakeOnlySeerClaimMatches: 0,
    dayOneLoneSeerClaimMatches: 0,
    dayOneLoneSeerClaimWasTrueMatches: 0,
    dayOneLoneSeerClaimWasFakeMatches: 0,
    madmanClaimMatches: 0,
    werewolfClaimMatches: 0,
    allDeceptiveRolesSilentMatches: 0,
    impossibleClaims: 0,
    budgetViolations: 0,
  };

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
        const events = repo.events(record.id);
        const ledger = claimLedgerFromEvents(events);
        const created = events.find((event) => event.type === 'match_created');
        const players = (created?.payload.players ?? []) as Array<{ seat: string; role: string }>;
        const roleBySeat = new Map(players.map((player) => [player.seat, player.role]));
        const trueSeer = players.find((player) => player.role === 'seer');
        const trueSeerClaim = ledger.find((entry) => entry.seat === trueSeer?.seat);
        const seerClaims = ledger.filter((entry) => entry.claimedRole === 'seer');
        const dayOneSeerClaims = seerClaims.filter((entry) => entry.coDay === 1);
        const counterclaims = seerClaims.filter((entry) => entry.seat !== trueSeer?.seat);
        const deceptiveClaims = ledger.filter((entry) => ['madman', 'werewolf'].includes(roleBySeat.get(entry.seat) ?? ''));
        claimMetrics.matches += 1;
        if (trueSeerClaim) claimMetrics.trueSeerClaims += 1;
        if (trueSeerClaim?.coDay === 1) claimMetrics.trueSeerDayOneClaims += 1;
        if (trueSeerClaim && counterclaims.length > 0) claimMetrics.counterclaimMatches += 1;
        if (trueSeerClaim && counterclaims.length === 0) claimMetrics.loneTrueSeerMatches += 1;
        if (seerClaims.length === 1) claimMetrics.loneSeerClaimMatches += 1;
        if (seerClaims.length === 1 && seerClaims[0].seat === trueSeer?.seat) claimMetrics.loneSeerClaimWasTrueMatches += 1;
        if (seerClaims.length === 1 && seerClaims[0].seat !== trueSeer?.seat) claimMetrics.fakeOnlySeerClaimMatches += 1;
        if (dayOneSeerClaims.length === 1) claimMetrics.dayOneLoneSeerClaimMatches += 1;
        if (dayOneSeerClaims.length === 1 && dayOneSeerClaims[0].seat === trueSeer?.seat) claimMetrics.dayOneLoneSeerClaimWasTrueMatches += 1;
        if (dayOneSeerClaims.length === 1 && dayOneSeerClaims[0].seat !== trueSeer?.seat) claimMetrics.dayOneLoneSeerClaimWasFakeMatches += 1;
        if (deceptiveClaims.some((entry) => roleBySeat.get(entry.seat) === 'madman')) claimMetrics.madmanClaimMatches += 1;
        if (deceptiveClaims.some((entry) => roleBySeat.get(entry.seat) === 'werewolf')) claimMetrics.werewolfClaimMatches += 1;
        if (deceptiveClaims.length === 0) claimMetrics.allDeceptiveRolesSilentMatches += 1;
        for (const entry of ledger) {
          const days = new Set<number>();
          const verdictByTarget = new Map<string, string>();
          for (const result of entry.results) {
            if (days.has(result.day) || result.day >= result.announcedDay || result.targetSeat === entry.seat) {
              claimMetrics.impossibleClaims += 1;
            }
            const priorVerdict = verdictByTarget.get(result.targetSeat);
            if (priorVerdict && priorVerdict !== result.verdict) claimMetrics.impossibleClaims += 1;
            days.add(result.day);
            verdictByTarget.set(result.targetSeat, result.verdict);
          }
        }
        for (const closed of events.filter((event) => event.type === 'discussion_closed')) {
          const allowedFreeSpeeches = Number(closed.payload.openingSpeeches) +
            Number(closed.payload.consensusDefenseExtraSpeeches ?? 0);
          if (Number(closed.payload.freeSpeeches) > allowedFreeSpeeches ||
            Number(closed.payload.intentPolls) > 2) claimMetrics.budgetViolations += 1;
        }
        console.log(`${index + 1}/${matches} seed=${record.seed} winner=${current.winner} events=${events.length} apiCalls=${current.apiCalls} claims=${ledger.length}`);
        break;
      }
      if (['paused_error', 'aborted', 'aborted_budget'].includes(current.status)) {
        throw new Error(`Match ${record.id} stopped: ${JSON.stringify(current.error)}`);
      }
    }
  }
  if (ai === 'mock') {
    const rate = (count: number) => claimMetrics.matches > 0 ? Number((count / claimMetrics.matches).toFixed(3)) : 0;
    console.log(`claimMetrics=${JSON.stringify({
      ...claimMetrics,
      trueSeerDayOneRate: rate(claimMetrics.trueSeerDayOneClaims),
      counterclaimRate: rate(claimMetrics.counterclaimMatches),
      loneTrueSeerRate: rate(claimMetrics.loneTrueSeerMatches),
      madmanClaimRate: rate(claimMetrics.madmanClaimMatches),
      werewolfClaimRate: rate(claimMetrics.werewolfClaimMatches),
      allDeceptiveRolesSilentRate: rate(claimMetrics.allDeceptiveRolesSilentMatches),
      loneSeerClaimTruthRate: claimMetrics.loneSeerClaimMatches > 0
        ? Number((claimMetrics.loneSeerClaimWasTrueMatches / claimMetrics.loneSeerClaimMatches).toFixed(3))
        : 0,
      dayOneLoneSeerClaimTruthRate: claimMetrics.dayOneLoneSeerClaimMatches > 0
        ? Number((claimMetrics.dayOneLoneSeerClaimWasTrueMatches / claimMetrics.dayOneLoneSeerClaimMatches).toFixed(3))
        : 0,
    })}`);
  }
}

void main();
