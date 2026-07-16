import { ROLE_LABEL } from '@/domain/constants';
import type { DecisionContext, SpeechDecision } from '@/domain/types';

const resultLikeClaim = /(?:人狼では(?:ない|ありません)|人狼|黒|白)(?:でした|だった|です|だよ|と出|判定|結果)/;

function publicRoleClaimExists(context: DecisionContext, roleLabel: string): boolean {
  return context.publicHistory.some((line) => line.startsWith(`${context.actor.name}:`) && line.includes(roleLabel));
}

export function resultDisclosureGuidance(context: DecisionContext): string | null {
  if (context.kind !== 'speech' || !['seer', 'medium'].includes(context.actor.role)) return null;
  const roleLabel = ROLE_LABEL[context.actor.role];
  if (publicRoleClaimExists(context, roleLabel)) {
    return `あなたはすでに${roleLabel}CO済みです。能力結果を話すときは、自分が知った結果と推理を区別してください。`;
  }
  return `能力結果を初めて公開する場合は、結果だけを断定せず、必ず同じ発言内で「${roleLabel}COです」または「私は${roleLabel}です」と名乗ってから対象と結果を伝えてください。結果を伏せるならCOする必要はありません。`;
}

export function validateSpeechDisclosure(context: DecisionContext, decision: SpeechDecision): void {
  if (context.kind !== 'speech' || !['seer', 'medium'].includes(context.actor.role)) return;
  const hasPrivateResult = context.privateFacts.some((fact) => /: (?:人狼|人狼ではない|判定対象なし)$/.test(fact));
  if (!hasPrivateResult || !resultLikeClaim.test(decision.speech)) return;
  const roleLabel = ROLE_LABEL[context.actor.role];
  if (publicRoleClaimExists(context, roleLabel) || decision.speech.includes(roleLabel)) return;
  throw new Error(`Result disclosure parse validation failed: ${roleLabel} CO is required`);
}
