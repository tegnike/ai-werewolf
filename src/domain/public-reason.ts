import { addressBookForSeat, agentNameForSeat } from './agents';
import type { ClaimLedger } from './claims';
import { SANITIZED_VOTE_REASON, SEATS } from './constants';
import type { SeatId } from './types';
import { characterForSeat, characterNameForSeat, type CharacterRoster } from './characters';

const ROLE_LABELS = ['占い師', '霊媒師'] as const;
const FIRST_PERSON = '(?:私|わたし|あたし|うち|僕|俺|わし|自分)';
const ROLE_ASSERTION = '(?:です|だよ|だ|やで|じゃ|よ|である|を名乗|として)';
const VERDICT = '(?:人狼では(?:ない|ありません|なかった|ありませんでした)|人狼(?!ではない|ではありません))';

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function actorNames(actorSeat: SeatId, characters?: CharacterRoster): string[] {
  const fullName = characters ? characterNameForSeat(characters, actorSeat) : agentNameForSeat(actorSeat);
  return [fullName, ...fullName.split(/\s+/)].filter(Boolean);
}

function otherReferenceTerms(actorSeat: SeatId, characters?: CharacterRoster): string[] {
  const addressed = characters
    ? Object.values(characterForSeat(characters, actorSeat).addressBook).filter((term): term is string => Boolean(term))
    : Object.values(addressBookForSeat(actorSeat)).filter((term): term is string => Boolean(term));
  const fullNames = SEATS.filter((seat) => seat !== actorSeat)
    .map((seat) => characters ? characterNameForSeat(characters, seat) : agentNameForSeat(seat));
  return [...new Set([...addressed, ...fullNames])];
}

function mentionsOtherPlayer(reason: string, actorSeat: SeatId, characters?: CharacterRoster): boolean {
  return otherReferenceTerms(actorSeat, characters).some((term) => reason.includes(term));
}

function attributesAbilityToOther(reason: string, actorSeat: SeatId, characters?: CharacterRoster): boolean {
  return otherReferenceTerms(actorSeat, characters).some((term) => {
    const escaped = escapePattern(term);
    return new RegExp(`${escaped}.{0,16}(?:が|の|による).{0,20}(?:占|霊媒|判定|結果)`).test(reason);
  });
}

function unannouncedRoleClaim(reason: string, actorSeat: SeatId, claimLedger: ClaimLedger, characters?: CharacterRoster): boolean {
  const priorRole = claimLedger.find((entry) => entry.seat === actorSeat)?.claimedRole;
  const ownNames = actorNames(actorSeat, characters).map(escapePattern).join('|');
  for (const [role, label] of [['seer', ROLE_LABELS[0]], ['medium', ROLE_LABELS[1]]] as const) {
    if (priorRole === role) continue;
    const firstPersonClaim = new RegExp(`(?:${FIRST_PERSON}|${ownNames}).{0,16}${label}.{0,10}${ROLE_ASSERTION}|${label}.{0,10}(?:${FIRST_PERSON}|${ownNames}).{0,10}${ROLE_ASSERTION}`);
    if (firstPersonClaim.test(reason)) return true;
    const subjectlessClaim = new RegExp(`^(?:あの|実は|ちなみに|改めて)?[、…\\s]*${label}.{0,10}${ROLE_ASSERTION}`);
    if (reason.split(/[。！？\n]/).some((sentence) =>
      subjectlessClaim.test(sentence.trim()) && !mentionsOtherPlayer(sentence, actorSeat, characters))) return true;
  }
  return false;
}

function unstructuredAbilityResult(reason: string, actorSeat: SeatId, characters?: CharacterRoster): boolean {
  const ownNames = actorNames(actorSeat, characters).map(escapePattern).join('|');
  const selfAbility = new RegExp(`(?:${FIRST_PERSON}|${ownNames}).{0,32}(?:占った|占いました|霊媒した|霊媒しました|判定した|判定しました).{0,32}${VERDICT}|(?:占った|占いました|霊媒した|霊媒しました|判定した|判定しました).{0,20}(?:${FIRST_PERSON}|${ownNames}).{0,20}${VERDICT}`);
  if (selfAbility.test(reason)) return true;
  const abilityResult = new RegExp(`(?:占った|占いました|霊媒した|霊媒しました|判定|能力結果|占い結果|霊媒結果|結果は).{0,32}${VERDICT}|${VERDICT}.{0,24}(?:という|との)?結果`);
  return abilityResult.test(reason) && !attributesAbilityToOther(reason, actorSeat, characters);
}

export function sanitizePublicVoteReason(
  reason: string,
  actorSeat: SeatId,
  claimLedger: ClaimLedger,
  characters?: CharacterRoster,
): { statedReason: string; reasonSanitized: boolean } {
  const sanitized = unannouncedRoleClaim(reason, actorSeat, claimLedger, characters) ||
    unstructuredAbilityResult(reason, actorSeat, characters);
  return sanitized
    ? { statedReason: SANITIZED_VOTE_REASON, reasonSanitized: true }
    : { statedReason: reason, reasonSanitized: false };
}
