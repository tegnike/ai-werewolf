import { ROLE_LABEL } from '@/domain/constants';
import type { DecisionContext, SpeechDecision } from '@/domain/types';

const resultLikeClaim = /(?:人狼では(?:ない|ありません)|人狼|黒|白)(?:でした|だった|です|だよ|と出|判定|結果)/;
const abbreviatedRoleClaim = /(?:^|[^A-Za-z])(?:CO|ＣＯ)(?=$|[^A-Za-z])/i;

function publicRoleClaimExists(context: DecisionContext, roleLabel: string): boolean {
  return context.publicHistory.some((line) => line.startsWith(`${context.actor.name}:`) && line.includes(roleLabel));
}

export function resultDisclosureGuidance(context: DecisionContext): string | null {
  if (context.kind !== 'speech' || !['seer', 'medium'].includes(context.actor.role)) return null;
  const roleLabel = ROLE_LABEL[context.actor.role];
  if (publicRoleClaimExists(context, roleLabel)) {
    return `あなたはすでに自分が${roleLabel}だと明かしています。能力結果を話すときは、自分が知った結果と推理を区別してください。`;
  }
  return `能力結果を初めて公開する場合は、結果だけを断定せず、必ず同じ発言内で「私は${roleLabel}です」と自然な日本語で名乗ってから対象と結果を伝えてください。結果を伏せるなら役職を名乗る必要はありません。`;
}

export function validateSpeechDisclosure(context: DecisionContext, decision: SpeechDecision): void {
  if (abbreviatedRoleClaim.test(decision.speech)) throw new Error('Speech parse validation failed: abbreviated role claim is forbidden');
  if (context.kind !== 'speech' || !['seer', 'medium'].includes(context.actor.role)) return;
  const hasPrivateResult = context.privateFacts.some((fact) => /: (?:人狼|人狼ではない|判定対象なし)$/.test(fact));
  if (!hasPrivateResult || !resultLikeClaim.test(decision.speech)) return;
  const roleLabel = ROLE_LABEL[context.actor.role];
  if (publicRoleClaimExists(context, roleLabel) || decision.speech.includes(roleLabel)) return;
  throw new Error(`Result disclosure parse validation failed: ${roleLabel} claim is required`);
}
