import { ROLE_LABEL } from '@/domain/constants';
import { ClaimContractError, assertClaimWithinDirective } from '@/domain/claims';
import type { DecisionContext, SpeechDecision } from '@/domain/types';
import { addressTermFor, agentNameForSeat } from '@/domain/agents';

const resultLikeClaim = /(?:人狼では(?:ない|ありません)|人狼|黒|白)(?:でした|だった|です|だよ|と出|判定|結果)/;
const abbreviatedRoleClaim = /(?:^|[^A-Za-z])(?:CO|ＣＯ)(?=$|[^A-Za-z])/i;
const firstPersonRoleClaim = /(?:私|わたし|僕|俺|自分)(?:は|が|、)?[^。！？\n]{0,12}(?:占い師|霊媒師)(?:です|だ|である|を名乗|として)/;
const confirmedPrivateResult = [
  /(?:人狼ではない|人狼|村人|白|黒)(?:だ|です|だった|でした|だと|であると)?[^。！？\n]{0,18}(?:確認でき|確認して|分かって|わかって|知っている|把握している)/,
  /(?:確認でき|確認して|分かって|わかって|知っている|把握している)[^。！？\n]{0,18}(?:人狼ではない|人狼|村人|白|黒)/,
  /(?:私|わたし|僕|俺|自分)[^。！？\n]{0,30}(?:占った|占いました|霊媒した)[^。！？\n]{0,30}(?:人狼ではない|人狼|村人|白|黒)/,
];
const withheldPrivateResult = [
  /(?:占い|霊媒|能力|判定|結果|正体)[^。！？\n]{0,24}(?:今は|まだ)[^。！？\n]{0,12}(?:言えない|言えません|話せない|話せません|明かせない|明かせません|伏せ)/,
  /(?:今は|まだ)[^。！？\n]{0,12}(?:言えない|言えません|話せない|話せません|明かせない|明かせません|伏せ)[^。！？\n]{0,24}(?:占い|霊媒|能力|判定|結果|正体)/,
];

function hintsAtUnstructuredPrivateResult(speech: string): boolean {
  return [...confirmedPrivateResult, ...withheldPrivateResult].some((pattern) => pattern.test(speech));
}

function publicRoleClaimExists(context: DecisionContext, roleLabel: string): boolean {
  return context.publicHistory.some((line) => line.startsWith(`${context.actor.name}:`) && line.includes(roleLabel));
}

export function resultDisclosureGuidance(context: DecisionContext): string | null {
  if (context.claimDirective) {
    const directive = context.claimDirective;
    if (directive.mode === 'forbidden') {
      return '今回は役職を名乗らず、claimはnullにして公開情報への通常の発言だけをしてください。自分の能力結果や確認済みの正体を本文にも出さず、「村人だと確認できている」「結果はあるが今は言えない」のような匂わせもしないでください。';
    }
    const roleLabel = directive.claimedRole === 'seer' ? '占い師' : '霊媒師';
    const results = directive.results.map((result) =>
      `${result.day}日目の${addressTermFor(context.actor.seat, result.targetSeat)}の結果は${result.verdict}`).join('、');
    const action = directive.mode === 'must'
      ? `今回は必ず「私は${roleLabel}です」と名乗り`
      : `今回は「私は${roleLabel}です」と名乗っても、まだ伏せても構いません。伏せる場合はclaimをnullにし、能力結果、確認済みの正体、結果を持っている事実を本文にも匂わせないでください。名乗る場合は`;
    return `${action}、claimにもclaimedRole=${directive.claimedRole}を設定してください。${results ? `認可された結果は「${results}」です。結果を対象・日・判定ごと変えず、本文とclaimの両方へ過不足なく入れてください。` : '結果一覧は空のままにしてください。'} この主張指示や仕組み自体には言及しないでください。`;
  }
  if (context.kind !== 'speech' || !['seer', 'medium'].includes(context.actor.role)) return null;
  const roleLabel = ROLE_LABEL[context.actor.role];
  if (publicRoleClaimExists(context, roleLabel)) {
    return `あなたはすでに自分が${roleLabel}だと明かしています。能力結果を話すときは、自分が知った結果と推理を区別してください。`;
  }
  return `能力結果を初めて公開する場合は、結果だけを断定せず、必ず同じ発言内で「私は${roleLabel}です」と自然な日本語で名乗ってから対象と結果を伝えてください。結果を伏せるなら役職を名乗る必要はありません。`;
}

export function validateSpeechDisclosure(context: DecisionContext, decision: SpeechDecision): void {
  if (abbreviatedRoleClaim.test(decision.speech)) throw new Error('Speech parse validation failed: abbreviated role claim is forbidden');
  if (context.claimDirective) {
    assertClaimWithinDirective(decision.claim, context.claimDirective);
    if (!decision.claim) {
      if (hintsAtUnstructuredPrivateResult(decision.speech)) {
        throw new ClaimContractError(
          'unstructured_private_result',
          'claimをnullにする場合は、能力結果、確認済みの正体、結果を伏せている事実を本文にも書かないでください。公開情報からの推理だけを話してください。',
        );
      }
      if (firstPersonRoleClaim.test(decision.speech)) {
        throw new ClaimContractError('claim_missing_from_structure', '役職を名乗るなら本文とclaimの内容を一致させてください。');
      }
      return;
    }
    if (Array.from(decision.speech).length > 200) {
      throw new ClaimContractError('claim_speech_too_long', '役職名と結果を残して200文字以内にしてください。');
    }
    const roleLabel = decision.claim.claimedRole === 'seer' ? '占い師' : '霊媒師';
    if (!decision.speech.includes(roleLabel)) {
      throw new ClaimContractError('claimed_role_missing_from_speech', `本文でも${roleLabel}と明言してください。`);
    }
    for (const result of decision.claim.results) {
      const name = agentNameForSeat(result.targetSeat);
      const address = addressTermFor(context.actor.seat, result.targetSeat);
      const verdictPattern = result.verdict === '人狼'
        ? /(?:人狼(?!ではない|ではありません|じゃない)|黒)/
        : /(?:人狼では(?:ない|ありません|なかった|ありませんでした)|人狼じゃ(?:ない|なかった)|白)/;
      if ((!decision.speech.includes(address) && !decision.speech.includes(name)) || !verdictPattern.test(decision.speech)) {
        throw new ClaimContractError('result_missing_from_speech', '本文でも対象者の名前と白黒の結果を明言してください。');
      }
    }
    if (decision.claim.results.length > 1 && decision.claim.results.some((result) =>
      !decision.speech.includes(`${result.day}日`) && !decision.speech.includes(`第${result.day}夜`))) {
      throw new ClaimContractError('result_day_missing_from_speech', '複数結果を伝える場合は各対象夜または処刑日を本文へ入れてください。');
    }
    return;
  }
  if (context.kind !== 'speech' || !['seer', 'medium'].includes(context.actor.role)) return;
  const hasPrivateResult = context.privateFacts.some((fact) => /: (?:人狼|人狼ではない|判定対象なし)$/.test(fact));
  if (!hasPrivateResult || !resultLikeClaim.test(decision.speech)) return;
  const roleLabel = ROLE_LABEL[context.actor.role];
  if (publicRoleClaimExists(context, roleLabel) || decision.speech.includes(roleLabel)) return;
  throw new Error(`Result disclosure parse validation failed: ${roleLabel} claim is required`);
}
