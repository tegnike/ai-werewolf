import type { MatchEvent, SeatId } from './types';

export type ClaimableRole = 'seer' | 'medium';
export type ClaimVerdict = '人狼' | '人狼ではない';
export type ClaimStage = 'opening' | 'free';

export interface ClaimResult {
  day: number;
  targetSeat: SeatId;
  verdict: ClaimVerdict;
}

export interface SpeechClaim {
  claimedRole: ClaimableRole;
  results: ClaimResult[];
}

export interface ClaimLedgerResult extends ClaimResult {
  announcedDay: number;
}

export interface ClaimLedgerEntry {
  seat: SeatId;
  name: string;
  claimedRole: ClaimableRole;
  coDay: number;
  coStage: ClaimStage;
  results: ClaimLedgerResult[];
}

export type ClaimLedger = ClaimLedgerEntry[];

export interface ClaimDirective {
  mode: 'must' | 'may' | 'forbidden';
  claimedRole: ClaimableRole | null;
  results: ClaimResult[];
  counterTargetSeat: SeatId | null;
}

export class ClaimContractError extends Error {
  constructor(public readonly rule: string, public readonly repairHint: string) {
    super(`Claim validation failed: ${rule}`);
  }
}

export function sameClaimResult(a: ClaimResult, b: ClaimResult): boolean {
  return a.day === b.day && a.targetSeat === b.targetSeat && a.verdict === b.verdict;
}

export function foldClaim(
  ledger: ClaimLedger,
  speech: { seat: SeatId; name: string; day: number; stage: ClaimStage; claim?: SpeechClaim | null },
): ClaimLedger {
  if (!speech.claim) return ledger;
  const existing = ledger.find((entry) => entry.seat === speech.seat);
  if (existing && existing.claimedRole !== speech.claim.claimedRole) {
    throw new ClaimContractError('role_switch', '一度名乗った役職から別の役職へ変更できません。');
  }
  const entry: ClaimLedgerEntry = existing
    ? { ...existing, results: [...existing.results] }
    : {
        seat: speech.seat,
        name: speech.name,
        claimedRole: speech.claim.claimedRole,
        coDay: speech.day,
        coStage: speech.stage,
        results: [],
  };
  for (const result of speech.claim.results) {
    const sameTarget = entry.results.find((item) => item.targetSeat === result.targetSeat);
    if (sameTarget && sameTarget.verdict !== result.verdict) {
      throw new ClaimContractError('contradictory_target_result', '以前に主張した対象が人狼だったか人狼ではなかったかを変更できません。');
    }
    const sameDay = entry.results.find((item) => item.day === result.day);
    if (sameDay && !sameClaimResult(sameDay, result)) {
      throw new ClaimContractError('contradictory_result', '同じ対象日の結果を変更できません。');
    }
    if (!sameDay) entry.results.push({ ...result, announcedDay: speech.day });
  }
  entry.results.sort((a, b) => a.day - b.day || a.targetSeat.localeCompare(b.targetSeat));
  return existing
    ? ledger.map((item) => item.seat === entry.seat ? entry : item)
    : [...ledger, entry];
}

export function claimLedgerFromEvents(events: MatchEvent[]): ClaimLedger {
  return events.reduce<ClaimLedger>((ledger, event) => {
    if (event.type !== 'discussion_speech') return ledger;
    const payload = event.payload as Record<string, unknown>;
    if (typeof payload.seat !== 'string' || typeof payload.name !== 'string') return ledger;
    if (payload.stage !== 'opening' && payload.stage !== 'free') return ledger;
    return foldClaim(ledger, {
      seat: payload.seat as SeatId,
      name: payload.name,
      day: event.day,
      stage: payload.stage,
      claim: (payload.claim ?? null) as SpeechClaim | null,
    });
  }, []);
}

export function claimBoardDigest(ledger: ClaimLedger): string[] {
  return ledger.map((entry) => {
    const role = entry.claimedRole === 'seer' ? '占い師' : '霊媒師';
    const results = entry.results.map((result) =>
      `${result.day}日:${result.targetSeat}=${result.verdict}`).join('、');
    return `${entry.name}は${role}を名乗っています${results ? `（${results}）` : ''}`;
  });
}

export function unannouncedResults(available: ClaimResult[], entry: ClaimLedgerEntry | undefined): ClaimResult[] {
  if (!entry) return [...available];
  return available.filter((result) => !entry.results.some((announced) => sameClaimResult(announced, result)));
}

export function assertClaimWithinDirective(claim: SpeechClaim | null | undefined, directive: ClaimDirective): void {
  if (directive.mode === 'forbidden') {
    if (claim) throw new ClaimContractError('forbidden_claim', '今回は役職を名乗らず通常の発言だけをしてください。');
    return;
  }
  if (!claim) {
    if (directive.mode === 'must') {
      throw new ClaimContractError('required_claim_missing', '今回は指定された役職と結果を必ず主張してください。');
    }
    return;
  }
  if (claim.claimedRole !== directive.claimedRole) {
    throw new ClaimContractError('wrong_claimed_role', '指定された役職だけを名乗ってください。');
  }
  const duplicateDays = new Set<number>();
  for (const result of claim.results) {
    if (duplicateDays.has(result.day)) {
      throw new ClaimContractError('duplicate_result_day', '同じ対象日の結果を重複させないでください。');
    }
    duplicateDays.add(result.day);
  }
  const exact = claim.results.length === directive.results.length &&
    claim.results.every((result) => directive.results.some((allowed) => sameClaimResult(result, allowed)));
  if (!exact) {
    throw new ClaimContractError('unauthorized_result', '指定された対象・日・結果を変えず、一覧を過不足なく伝えてください。');
  }
}
