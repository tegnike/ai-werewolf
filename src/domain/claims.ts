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

export type ClaimIntentAction = 'claim_now' | 'wait' | 'stay_hidden';
export type ClaimIntentTrigger = 'opening' | 'counterclaim' | 'blackened' | 'pressure' | 'later_day' | 'none';
export const CLAIM_INTENT_BASES = [
  'information_duty', 'initiative', 'counterclaim', 'self_preservation', 'control_discussion',
  'avoid_spotlight', 'avoid_crowding', 'protect_team', 'maintain_plan',
] as const;
export type ClaimIntentBasis = (typeof CLAIM_INTENT_BASES)[number];

/** claims v3/v4で通常発言と同時に返す、公開イベントへは出さない役職主張方針。 */
export interface ClaimIntent {
  action: ClaimIntentAction;
  plannedRole: ClaimableRole | null;
  trigger: ClaimIntentTrigger;
  /** claims v4で、どの人格特性・盤面コストを決定打にしたかを非公開で監査する。 */
  basis?: ClaimIntentBasis;
}

export interface ClaimDecisionSituation {
  existingRoleClaims: Record<ClaimableRole, number>;
  actorBlackened: boolean;
  day: number;
  stage: ClaimStage;
  turn: number | null;
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
  /** claims v3/v4では複数の合法な主張からLLM自身が選ぶ。v1/v2には存在しない。 */
  options?: SpeechClaim[];
  /** trueならclaimと同時に非公開claimIntentを必須にする。 */
  strategicChoice?: true;
  /** 同じ試合の以前の発言で本人が選んだ非公開方針。 */
  priorIntent?: ClaimIntent | null;
  /** claims v4で、LLMが人格特性とCO人数を明示的に比較するための公開盤面。 */
  personalityContext?: ClaimDecisionSituation;
}

export class ClaimContractError extends Error {
  constructor(public readonly rule: string, public readonly repairHint: string) {
    super(`Claim validation failed: ${rule}`);
  }
}

export function sameClaimResult(a: ClaimResult, b: ClaimResult): boolean {
  return a.day === b.day && a.targetSeat === b.targetSeat && a.verdict === b.verdict;
}

function sameSpeechClaim(a: SpeechClaim, b: SpeechClaim): boolean {
  return a.claimedRole === b.claimedRole && a.results.length === b.results.length &&
    a.results.every((result) => b.results.some((candidate) => sameClaimResult(result, candidate)));
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
  const options = directive.options?.length ? directive.options : directive.claimedRole ? [{
    claimedRole: directive.claimedRole,
    results: directive.results,
  }] : [];
  if (!options.some((option) => option.claimedRole === claim.claimedRole)) {
    throw new ClaimContractError('wrong_claimed_role', '指定された役職だけを名乗ってください。');
  }
  const duplicateDays = new Set<number>();
  for (const result of claim.results) {
    if (duplicateDays.has(result.day)) {
      throw new ClaimContractError('duplicate_result_day', '同じ対象日の結果を重複させないでください。');
    }
    duplicateDays.add(result.day);
  }
  const exact = options.some((option) => sameSpeechClaim(claim, option));
  if (!exact) {
    throw new ClaimContractError('unauthorized_result', '指定された対象・日・結果を変えず、一覧を過不足なく伝えてください。');
  }
}


export function assertClaimIntentWithinDirective(
  intent: ClaimIntent | null | undefined,
  claim: SpeechClaim | null | undefined,
  directive: ClaimDirective,
): void {
  if (!directive.strategicChoice) return;
  if (!intent) {
    throw new ClaimContractError('claim_intent_missing', '役職主張をするか待つかの非公開方針claimIntentを必ず返してください。');
  }
  if (directive.personalityContext && !intent.basis) {
    throw new ClaimContractError('claim_basis_missing', '人格と盤面のどちらを決定打にしたかbasisを必ず指定してください。');
  }
  const optionRoles = new Set((directive.options ?? []).map((option) => option.claimedRole));
  if (intent.plannedRole && !optionRoles.has(intent.plannedRole)) {
    throw new ClaimContractError('unauthorized_planned_role', 'plannedRoleは認可された役職だけを指定してください。');
  }
  if (intent.action === 'claim_now') {
    if (!claim || intent.plannedRole !== claim.claimedRole) {
      throw new ClaimContractError('claim_intent_mismatch', 'claim_nowならclaimを出し、plannedRoleを実際に名乗る役職と一致させてください。');
    }
    return;
  }
  if (claim) {
    throw new ClaimContractError('claim_intent_mismatch', 'waitまたはstay_hiddenを選ぶならclaimはnullにしてください。');
  }
  if (intent.action === 'stay_hidden' && intent.trigger !== 'none') {
    throw new ClaimContractError('hidden_trigger_mismatch', 'stay_hiddenではtriggerをnoneにしてください。');
  }
  if (intent.action === 'wait' && intent.trigger === 'none') {
    throw new ClaimContractError('wait_trigger_missing', 'waitでは名乗りを再検討する公開上のtriggerを指定してください。');
  }
  if (intent.action === 'wait' && intent.plannedRole === null) {
    throw new ClaimContractError('wait_role_missing', 'waitでは再検討中の認可済み役職をplannedRoleへ指定してください。');
  }
}
