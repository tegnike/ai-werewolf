import type { ClaimDirective, ClaimLedger, ClaimResult, ClaimStage, ClaimableRole } from '@/domain/claims';
import { unannouncedResults } from '@/domain/claims';
import type { Player, Role, SeatId } from '@/domain/types';
import { stableIndex } from './prng';

export type ClaimStance = 'truth' | 'fake' | 'silent';
export type ClaimsVersion = 'v1' | 'v2';

export interface ClaimSlot {
  day: number;
  stage: ClaimStage;
}

export interface ClaimPolicy {
  version: ClaimsVersion;
  seat: SeatId;
  actualRole: Role;
  stance: ClaimStance;
  claimedRole: ClaimableRole | null;
  slot: ClaimSlot | null;
  deadline: ClaimSlot | null;
  counterPercent: number;
  advancePercent: number;
  lateCounterPercent: number;
  emergencyCounterPercent: number;
}

export interface ClaimMoment {
  day: number;
  stage: ClaimStage;
  /** その日の公開議論全体で次に発言するturn。v1では未使用。 */
  turn?: number;
}

const boldnessBySeat: Record<SeatId, number> = {
  'seat-1': -3,
  'seat-2': 10,
  'seat-3': -1,
  'seat-4': -7,
  'seat-5': 9,
  'seat-6': 5,
  'seat-7': 8,
  'seat-8': 2,
  'seat-9': -8,
};

function happens(seed: string, purposeKey: string, percent: number): boolean {
  if (percent <= 0) return false;
  const bounded = Math.max(5, Math.min(95, percent));
  return stableIndex(seed, `claims/v1/${purposeKey}`, 100) < bounded;
}

function pickSeerSlot(seed: string, seat: SeatId, version: ClaimsVersion, bias: number): ClaimSlot {
  const roll = stableIndex(seed, `claims/${version}/slot/seer/${seat}`, 100);
  if (version === 'v1') {
    if (roll < 30) return { day: 1, stage: 'opening' };
    if (roll < 58) return { day: 1, stage: 'free' };
    return { day: 2, stage: 'opening' };
  }
  const openingThreshold = 70 + bias;
  const dayOneThreshold = Math.min(99, 95 + Math.trunc(bias / 2));
  if (roll < openingThreshold) return { day: 1, stage: 'opening' };
  if (roll < dayOneThreshold) return { day: 1, stage: 'free' };
  return { day: 2, stage: 'opening' };
}

function pickMediumSlot(seed: string, seat: SeatId): ClaimSlot {
  const roll = stableIndex(seed, `claims/v1/slot/medium/${seat}`, 100);
  if (roll < 15) return { day: 1, stage: 'free' };
  if (roll < 80) return { day: 2, stage: 'opening' };
  return { day: 2, stage: 'free' };
}

function fakeRole(seed: string, seat: SeatId, seerPercent: number): ClaimableRole {
  return happens(seed, `fake-role/${seat}`, seerPercent) ? 'seer' : 'medium';
}

export function decideClaimPolicies(
  seed: string,
  players: Player[],
  version: ClaimsVersion = 'v1',
): Map<SeatId, ClaimPolicy> {
  const wolves = players.filter((player) => player.role === 'werewolf').sort((a, b) => a.seat.localeCompare(b.seat));
  const designatedWolf = wolves[stableIndex(seed, 'claims/v1/wolf-liar', wolves.length)]?.seat;
  return new Map(players.map((player): [SeatId, ClaimPolicy] => {
    const bias = boldnessBySeat[player.seat];
    if (player.role === 'seer') {
      return [player.seat, {
        version, seat: player.seat, actualRole: player.role, stance: 'truth', claimedRole: 'seer',
        slot: pickSeerSlot(seed, player.seat, version, bias), deadline: { day: 2, stage: 'opening' },
        counterPercent: 58 + Math.trunc(bias / 2), advancePercent: 0, lateCounterPercent: 0, emergencyCounterPercent: 0,
      }];
    }
    if (player.role === 'medium') {
      return [player.seat, {
        version, seat: player.seat, actualRole: player.role, stance: 'truth', claimedRole: 'medium',
        slot: pickMediumSlot(seed, player.seat), deadline: { day: 3, stage: 'opening' },
        counterPercent: 92, advancePercent: 0, lateCounterPercent: 0, emergencyCounterPercent: 0,
      }];
    }
    if (player.role === 'madman') {
      const role = fakeRole(seed, player.seat, 78);
      const fake = happens(seed, `stance/madman/${player.seat}`, 62 + bias);
      return [player.seat, {
        version, seat: player.seat, actualRole: player.role, stance: fake ? 'fake' : 'silent', claimedRole: role,
        slot: fake ? (role === 'seer' ? pickSeerSlot(seed, player.seat, version, bias) : pickMediumSlot(seed, player.seat)) : null,
        deadline: null, counterPercent: 78 + Math.trunc(bias / 2), advancePercent: 42 + Math.trunc(bias / 2), lateCounterPercent: 3,
        emergencyCounterPercent: 0,
      }];
    }
    if (player.role === 'werewolf') {
      const designated = player.seat === designatedWolf;
      const role = fakeRole(seed, player.seat, 68);
      const fake = designated && happens(seed, `stance/wolf/${player.seat}`, 16 + Math.trunc(bias / 2));
      return [player.seat, {
        version, seat: player.seat, actualRole: player.role, stance: fake ? 'fake' : 'silent', claimedRole: role,
        slot: fake ? (role === 'seer' ? pickSeerSlot(seed, player.seat, version, bias) : pickMediumSlot(seed, player.seat)) : null,
        deadline: null, counterPercent: 62 + Math.trunc(bias / 2), advancePercent: 16 + Math.trunc(bias / 3), lateCounterPercent: designated ? 2 : 0,
        emergencyCounterPercent: 6 + Math.trunc(bias / 4),
      }];
    }
    return [player.seat, {
      version, seat: player.seat, actualRole: player.role, stance: 'silent', claimedRole: null,
      slot: null, deadline: null, counterPercent: 0, advancePercent: 0, lateCounterPercent: 0, emergencyCounterPercent: 0,
    }];
  }));
}

function reached(moment: ClaimMoment, slot: ClaimSlot | null): boolean {
  if (!slot) return false;
  if (moment.day !== slot.day) return moment.day > slot.day;
  return moment.stage === slot.stage || moment.stage === 'free';
}

function resultBlackens(ledger: ClaimLedger, seat: SeatId): boolean {
  return ledger.some((entry) => entry.results.some((result) =>
    result.targetSeat === seat && result.verdict === '人狼'));
}

function claimBatch(results: ClaimResult[]): ClaimResult[] {
  return [...results]
    .sort((a, b) => Number(b.verdict === '人狼') - Number(a.verdict === '人狼') || a.day - b.day)
    .slice(0, 4);
}

export function claimDirectiveFor(
  seed: string,
  policy: ClaimPolicy,
  ledger: ClaimLedger,
  availableResults: Record<ClaimableRole, ClaimResult[]>,
  moment: ClaimMoment,
): ClaimDirective {
  const prior = ledger.find((entry) => entry.seat === policy.seat);
  if (prior) {
    const pending = unannouncedResults(availableResults[prior.claimedRole], prior);
    if (pending.length === 0) return { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null };
    const must = pending.some((result) => result.verdict === '人狼');
    return { mode: must ? 'must' : 'may', claimedRole: prior.claimedRole, results: claimBatch(pending), counterTargetSeat: null };
  }

  let role = policy.claimedRole;
  let emergency = false;
  if (policy.actualRole === 'werewolf' && resultBlackens(ledger, policy.seat) &&
    happens(seed, `emergency/${policy.seat}`, policy.emergencyCounterPercent)) {
    role = 'seer';
    emergency = true;
  }
  if (!role) return { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null };
  const allResults = availableResults[role];
  const results = claimBatch(allResults);
  const rivals = ledger.filter((entry) => entry.seat !== policy.seat && entry.claimedRole === role);
  const rival = rivals[0];
  const counter = policy.stance !== 'silent' && Boolean(rival && happens(
    seed,
    `counter/${policy.seat}/${rival.seat}/co${rival.coDay}/d${moment.day}`,
    policy.counterPercent,
  ));
  const lateCounter = policy.stance === 'silent' && moment.day >= 2 && Boolean(rival) && happens(
    seed,
    `late-counter/${policy.seat}/${rival?.seat}`,
    policy.lateCounterPercent,
  );
  const truthBlack = policy.actualRole === 'seer' && allResults.some((result) => result.verdict === '人狼');
  const fakeAdvance = policy.stance === 'fake' && role === 'seer' && moment.day === 1 && !rival && happens(
    seed,
    `advance/${policy.seat}`,
    policy.advancePercent,
  );
  const deadline = policy.stance === 'truth' && reached(moment, policy.deadline);
  const dayOneSeerTurnDeadline = policy.version === 'v2' && policy.actualRole === 'seer' &&
    moment.day === 1 && (moment.turn ?? 0) >= 6;
  const scheduled = policy.stance !== 'silent' && reached(moment, policy.slot);

  if (emergency || counter || lateCounter || truthBlack || deadline || dayOneSeerTurnDeadline || fakeAdvance || (scheduled && policy.stance === 'fake')) {
    return { mode: 'must', claimedRole: role, results, counterTargetSeat: rival?.seat ?? null };
  }
  if (scheduled) return { mode: 'may', claimedRole: role, results, counterTargetSeat: rival?.seat ?? null };
  return { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null };
}

function sortedCandidates(aliveSeats: SeatId[], actorSeat: SeatId): SeatId[] {
  return [...new Set(aliveSeats.filter((seat) => seat !== actorSeat))].sort();
}

export function planMadmanSeerFake(seed: string, seat: SeatId, night: number, aliveSeats: SeatId[]): ClaimResult {
  const candidates = sortedCandidates(aliveSeats, seat);
  const targetSeat = candidates[stableIndex(seed, `claims/v1/fake/madman/${seat}/n${night}/target`, candidates.length)];
  const blackPercent = night === 0 ? 45 : 35;
  return {
    day: night,
    targetSeat,
    verdict: happens(seed, `fake/madman/${seat}/n${night}/black`, blackPercent) ? '人狼' : '人狼ではない',
  };
}

export function planWolfSeerFake(
  seed: string,
  seat: SeatId,
  night: number,
  aliveSeats: SeatId[],
  partnerSeats: SeatId[],
): ClaimResult {
  const candidates = sortedCandidates(aliveSeats, seat);
  const targetSeat = candidates[stableIndex(seed, `claims/v1/fake/wolf/${seat}/n${night}/target`, candidates.length)];
  return {
    day: night,
    targetSeat,
    verdict: partnerSeats.includes(targetSeat)
      ? '人狼ではない'
      : happens(seed, `fake/wolf/${seat}/n${night}/black`, 32) ? '人狼' : '人狼ではない',
  };
}

export function planMadmanMediumFake(seed: string, seat: SeatId, day: number, targetSeat: SeatId): ClaimResult {
  return {
    day,
    targetSeat,
    verdict: happens(seed, `fake/madman-medium/${seat}/d${day}/black`, 30) ? '人狼' : '人狼ではない',
  };
}

export function planWolfMediumFake(
  seed: string,
  seat: SeatId,
  day: number,
  targetSeat: SeatId,
  partnerSeats: SeatId[],
): ClaimResult {
  return {
    day,
    targetSeat,
    verdict: partnerSeats.includes(targetSeat)
      ? happens(seed, `fake/wolf-medium/${seat}/d${day}/partner-black`, 60) ? '人狼' : '人狼ではない'
      : happens(seed, `fake/wolf-medium/${seat}/d${day}/black`, 25) ? '人狼' : '人狼ではない',
  };
}

export function preserveFakeResultConsistency(history: ClaimResult[], next: ClaimResult): ClaimResult {
  const prior = history.find((result) => result.targetSeat === next.targetSeat);
  return prior ? { ...next, verdict: prior.verdict } : next;
}
