import { ROLE_LABEL } from '@/domain/constants';
import { ClaimContractError, assertClaimWithinDirective } from '@/domain/claims';
import type { DecisionContext, SpeechDecision } from '@/domain/types';
import { addressTermFor, agentNameForSeat } from '@/domain/agents';

const resultLikeClaim = /(?:人狼では(?:ない|ありません)|人狼)(?:でした|だった|です|だよ|と出|判定|結果)/;
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

function validateNaturalAlignmentTerms(speech: string): void {
  const speechWithoutSurname = speech.replaceAll('黒田', '');
  if (/[白黒]/.test(speechWithoutSurname)) {
    throw new ClaimContractError(
      'abbreviated_alignment_term',
      '台詞では「白」「黒」などの略語を使わず、「人狼だという結果」「人狼ではないという結果」のような自然な日本語へ言い換えてください。',
    );
  }
}

function mentionsSeat(context: DecisionContext, speech: string, seat: NonNullable<SpeechDecision['structure']>['voteIntent']): boolean {
  if (!seat) return true;
  return speech.includes(agentNameForSeat(seat)) || speech.includes(addressTermFor(context.actor.seat, seat));
}

function validateDiscussionStructure(context: DecisionContext, decision: SpeechDecision): void {
  if (context.discussion?.version !== 'v3') return;
  const structure = decision.structure;
  if (!structure) throw new ClaimContractError('discussion_structure_missing', 'structureを省略せず、実際の発言内容を自己分類してください。');
  if (structure.suspicion && !mentionsSeat(context, decision.speech, structure.suspicion.targetSeat)) {
    // 本文に裏付けのない公開メタデータは台帳へ載せない。本文を推測で解析して
    // 別の席へ付け替えるより、構造だけを安全側へ落とす方が確実である。
    structure.suspicion = null;
    if (structure.primaryAct === 'suspicion') structure.primaryAct = 'other';
  }
  if (structure.suspicion) {
    const { basis, evidenceDay } = structure.suspicion;
    if (typeof evidenceDay === 'number' && evidenceDay > context.day) {
      throw new ClaimContractError('future_suspicion_evidence', '疑いのevidenceDayには今日以前の日だけを指定してください。');
    }
    if (basis === 'intuition' && evidenceDay !== null && evidenceDay !== undefined) {
      structure.suspicion.evidenceDay = null;
    } else if (basis !== 'intuition' && evidenceDay === null) {
      throw new ClaimContractError('suspicion_evidence_day_missing', '勘以外の公開情報を疑いの根拠にする場合は、その情報が出た日をevidenceDayへ指定してください。');
    }
  }
  if (context.day === 1 && context.discussion?.turn === 1 && structure.suspicion) {
    if (!['intuition', 'result', 'role_claim'].includes(structure.suspicion.basis)) {
      throw new ClaimContractError('opening_unseen_behavior', '今日の最初の発言では他者の今日の態度や反応をまだ観察できません。疑いを出すなら勘・仮置きだと明示するか、自分の能力結果・同じ発言で公開する役職情報だけを根拠にしてください。');
    }
    if (structure.suspicion.basis === 'intuition' && !/(?:勘|直感|仮|材料.{0,8}(?:ない|ありません)|まだ.{0,8}(?:分から|わから|不明))/.test(decision.speech)) {
      throw new ClaimContractError('opening_intuition_unmarked', '今日の最初の発言で公開情報のない相手を疑うなら、本文でも勘・直感・仮置きであることを明示してください。未発言者の態度を観察したように話してはいけません。');
    }
  }
  if (structure.suspicion && context.discussion?.remainingUnspokenSeats?.includes(structure.suspicion.targetSeat)) {
    const evidenceIsToday = structure.suspicion.evidenceDay === context.day ||
      (structure.suspicion.evidenceDay === undefined && context.day === 1);
    if (evidenceIsToday && !['intuition', 'result', 'role_claim'].includes(structure.suspicion.basis)) {
      throw new ClaimContractError('unspoken_target_behavior', 'その相手は今日まだ発言していないため、今日の発言内容・反応・便乗・投票予定を疑いの根拠にできません。勘として仮置きするか、前日以前の公開情報の日をevidenceDayへ指定してください。');
    }
    if (structure.suspicion.basis === 'intuition' && !/(?:勘|直感|仮|材料.{0,8}(?:ない|ありません)|まだ.{0,8}(?:分から|わから|不明)|発言.{0,8}(?:前|ない|ありません))/.test(decision.speech)) {
      throw new ClaimContractError('unspoken_intuition_unmarked', '未発言者を公開情報なしで疑うなら、本文でも勘・直感・仮置きであることを明示してください。未発言者の態度を観察したように話してはいけません。');
    }
  }
  if (structure.primaryAct === 'vote_intent' && structure.voteIntent &&
    context.discussion?.priorVoteIntentTarget === structure.voteIntent) {
    structure.primaryAct = 'agreement';
    decision.contributionDemoted = true;
  }
  const consensusTarget = context.discussion?.consensusTarget;
  if (consensusTarget && mentionsSeat(context, decision.speech, consensusTarget)) {
    const sentences = decision.speech.split(/[。！？\n]/).filter((sentence) =>
      sentence.includes(agentNameForSeat(consensusTarget)) || sentence.includes(addressTermFor(context.actor.seat, consensusTarget)));
    const repeatsConsensusDeclaration = sentences.some((sentence) =>
      /(?:私|わたし|僕|俺|自分|今日は|今は).{0,36}(?:投票|票を入れ|に入れ|処刑する|吊る)|(?:投票|票を入れ|に入れ).{0,18}(?:予定|つもり)/.test(sentence));
    if (repeatsConsensusDeclaration) {
      throw new ClaimContractError(
        'consensus_vote_declaration_repeated',
        `${agentNameForSeat(consensusTarget)}への投票予定はすでに3人以上が公表しています。この発言では同じ予定を追加宣言せず、voteIntent=nullにして、増えた公開情報、質問、反証、または未検討の人物を話してください。最終投票先は別途選べます。`,
      );
    }
  }
  if (structure.voteIntent && (!mentionsSeat(context, decision.speech, structure.voteIntent) || !/(?:投票|入れ|処刑候補|吊)/.test(decision.speech))) {
    structure.voteIntent = null;
    if (structure.primaryAct === 'vote_intent') structure.primaryAct = 'other';
  }
  if (structure.primaryAct === 'question' && !decision.requestsReply) {
    structure.primaryAct = 'other';
    structure.questionTopic = null;
  }
  if (structure.questionTopic && structure.primaryAct !== 'answer' && !decision.requestsReply) {
    structure.questionTopic = null;
  }
  if (structure.boardAnalysis && (!/(?:占い師|霊媒師|役職)/.test(decision.speech) || !/(?:今日|処刑|投票|吊)/.test(decision.speech))) {
    structure.boardAnalysis = false;
    if (structure.primaryAct === 'board_analysis') structure.primaryAct = 'other';
  }
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
    const dayOneSeerDefault = directive.mode === 'may' && context.actor.role === 'seer' && context.day === 1
      ? '一般的な9人人狼では、人狼ではないという結果も候補を狭める公開材料になるため、1日目に占い師だと名乗って結果を出すのが基本です。伏せるのは、人物像と今の盤面に明確な理由がある例外にしてください。'
      : '';
    return `${action}、claimにもclaimedRole=${directive.claimedRole}を設定してください。${results ? `認可された結果は「${results}」です。結果を対象・日・判定ごと変えず、本文とclaimの両方へ過不足なく入れてください。` : '結果一覧は空のままにしてください。'} ${dayOneSeerDefault} この主張指示や仕組み自体には言及しないでください。`;
  }
  if (context.kind !== 'speech' || !['seer', 'medium'].includes(context.actor.role)) return null;
  const roleLabel = ROLE_LABEL[context.actor.role];
  if (publicRoleClaimExists(context, roleLabel)) {
    return `あなたはすでに自分が${roleLabel}だと明かしています。能力結果を話すときは、自分が知った結果と推理を区別してください。`;
  }
  return `能力結果を初めて公開する場合は、結果だけを断定せず、必ず同じ発言内で「私は${roleLabel}です」と自然な日本語で名乗ってから対象と結果を伝えてください。結果を伏せるなら役職を名乗る必要はありません。`;
}

export function validateSpeechDisclosure(context: DecisionContext, decision: SpeechDecision): void {
  validateNaturalAlignmentTerms(decision.speech);
  validateDiscussionStructure(context, decision);
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
        ? /人狼(?!ではない|ではありません|じゃない)/
        : /(?:人狼では(?:ない|ありません|なかった|ありませんでした)|人狼じゃ(?:ない|なかった))/;
      if ((!decision.speech.includes(address) && !decision.speech.includes(name)) || !verdictPattern.test(decision.speech)) {
        throw new ClaimContractError('result_missing_from_speech', '本文でも対象者の名前と、人狼だったか人狼ではなかったかを明言してください。');
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
