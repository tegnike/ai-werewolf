import { ROLE_LABEL } from '@/domain/constants';
import {
  ClaimContractError, assertClaimIntentWithinDirective, assertClaimWithinDirective,
} from '@/domain/claims';
import type { DecisionContext, SpeechDecision } from '@/domain/types';
import {
  characterAddressTerm, characterClaimStrategy, characterForSeat, characterNameForSeat, characterRoleClaimSentence,
} from '@/domain/characters';

const resultLikeClaim = /(?:人狼では(?:ない|ありません)|人狼)(?:でした|だった|です|だよ|と出|判定|結果)/;
const abbreviatedRoleClaim = /(?:^|[^A-Za-z])(?:CO|ＣＯ)(?=$|[^A-Za-z])/i;
const firstPersonRoleClaim = /(?:私|わたし|あたし|うち|僕|俺|わし|自分)(?:は|が|、)?[^。！？\n]{0,12}(?:占い師|霊媒師)(?:です|だよ|だ|やで|じゃ|よ|である|を名乗|として)/;
const confirmedPrivateResult = [
  /(?:人狼ではない|人狼|村人|白|黒)(?:だ|です|だった|でした|だと|であると)?[^。！？\n]{0,18}(?:確認でき|確認して|分かって|わかって|知っている|把握している)/,
  /(?:確認でき|確認して|分かって|わかって|知っている|把握している)[^。！？\n]{0,18}(?:人狼ではない|人狼|村人|白|黒)/,
  /(?:私|わたし|あたし|うち|僕|俺|わし|自分)[^。！？\n]{0,30}(?:占った|占いました|霊媒した)[^。！？\n]{0,30}(?:人狼ではない|人狼|村人|白|黒)/,
];
const withheldPrivateResult = [
  /(?:占い|霊媒|能力|判定|結果|正体)[^。！？\n]{0,24}(?:今は|まだ)[^。！？\n]{0,12}(?:言えない|言えません|話せない|話せません|明かせない|明かせません|伏せ)/,
  /(?:今は|まだ)[^。！？\n]{0,12}(?:言えない|言えません|話せない|話せません|明かせない|明かせません|伏せ)[^。！？\n]{0,24}(?:占い|霊媒|能力|判定|結果|正体)/,
];

const nameForSeat = (context: DecisionContext, seat: Parameters<typeof characterNameForSeat>[1]): string =>
  characterNameForSeat(context.characters, seat);
const addressForSeat = (context: DecisionContext, seat: Parameters<typeof characterNameForSeat>[1]): string =>
  characterAddressTerm(context.characters, context.actor.seat, seat);

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateSelfReference(context: DecisionContext, speech: string): void {
  const ownNames = [context.actor.name, ...context.actor.name.split(/\s+/)]
    .filter(Boolean)
    .map(escapePattern);
  const selfHonorific = new RegExp(`(?:${ownNames.join('|')})(?:さん|ちゃん|くん|君|様)`);
  if (selfHonorific.test(speech)) {
    throw new ClaimContractError(
      'self_reference_drift',
      '自分自身を名前や敬称付きで呼ばず、指定された一人称で話してください。他の参加者への呼び方は変更しないでください。',
    );
  }
  const expected = characterForSeat(context.characters, context.actor.seat).firstPerson;
  const unexpected = ['私', 'わたし', 'あたし', 'うち', '僕', '俺', 'わし', '自分']
    .filter((candidate) => candidate !== expected)
    .map(escapePattern)
    .join('|');
  const unexpectedSelfReference = new RegExp(`(?:^|[。！？\\n]\\s*)(?:${unexpected})(?:は|が|も|の|を|なら|には)`);
  if (unexpectedSelfReference.test(speech)) {
    throw new ClaimContractError(
      'first_person_drift',
      `一人称は「${expected}」に統一してください。自分を別の一人称で呼ばないでください。`,
    );
  }
}

function validateNightZeroReasonBoundary(context: DecisionContext, speech: string): void {
  if (context.day !== 1 || context.discussion?.version !== 'v3') return;
  const safeBoundary = /(?:無情報|推理上の理由.{0,8}(?:ない|ありません|存在しない)|(?:占い先|選定|そこ).{0,16}理由.{0,10}(?:ない|ありません|求めない|求めません|問わない|問いません|聞かない|聞きません|材料にしない|材料にしません|評価しない|評価しません)|(?:理由|根拠).{0,10}(?:求めない|求めません|問わない|問いません|聞かない|聞きません|材料にしない|材料にしません|評価しない|評価しません))/;
  const forbiddenReason = /(?:なぜ|どうして).{0,18}(?:占|そこを見|相手を選)|(?:占い先|そこを見た|相手を選んだ).{0,18}(?:理由|説明|一貫|具体|弱|納得|自然)|(?:結果に至った|その結果を出した).{0,12}理由|(?:その|占い|能力)?(?:結果|判定)(?:自体|そのもの)?(?:の|に至った)?(?:理由|根拠)|(?:人狼だ(?:と)?|人狼ではないと?)(?:見た|判断した|考えた)(?:理由|根拠)/;
  const reasonlessSelection = /(?:占い先|選定|選んだ対象).{0,18}理由.{0,10}(?:ない|ありません|存在しない)/;
  const credibilityEvaluation = /(?:信用|信じ|真らし|真っぽ|偽らし|偽っぽ|具体的|自然|一貫|評価|印象|差が|優れ|劣る|村っぽ|怪し|疑い|一歩)/;
  const reasonlessUsedAsDifference = reasonlessSelection.test(speech) &&
    /(?:この|その|そこ).{0,8}差.{0,8}(?:見|取|つけ|ある|気に)|差.{0,8}(?:評価|信用|信じ|真|偽)/.test(speech) &&
    !/(?:この|その|そこ).{0,8}差.{0,12}(?:つけない|つけません|材料にしない|材料にしません|として見ない|として見ません)/.test(speech);
  if (reasonlessUsedAsDifference) {
    throw new ClaimContractError(
      'night_zero_reason_is_not_evidence',
      '0日目の対象選定に理由がないと明言したことと、他の占い師候補がそれへ言及しなかったことの差は、信用比較の材料にしないでください。名乗った時期、主張結果、対抗、公開後の反応と発言を比べてください。',
    );
  }
  const offending = speech.split(/[。！？\n]/).find((sentence) => {
    if (reasonlessSelection.test(sentence) && credibilityEvaluation.test(sentence)) return true;
    const implicitNightZeroSelection = /(?:なぜ|どうして).{1,18}を選んだ/.test(sentence) &&
      !/(?:処刑|投票|疑い|候補|護衛|襲撃)/.test(sentence);
    if (implicitNightZeroSelection) return true;
    return forbiddenReason.test(sentence) && !safeBoundary.test(sentence);
  });
  if (offending) {
    throw new ClaimContractError(
      'night_zero_reason_is_not_evidence',
      '1日目に公開される0日目の占い先は無情報選択です。対象を選んだ理由を質問・評価せず、結果、役職を名乗った時期、対抗、結果を受けた本人の反応、公開後の発言を比較してください。',
    );
  }
}

function validateSpokenState(context: DecisionContext, speech: string): void {
  const remaining = context.discussion?.remainingUnspokenSeats;
  if (context.discussion?.version !== 'v3' || !remaining) return;
  const remainingSeats = new Set(remaining);
  const correction = /(?:見落と|訂正|誤り|間違|勘違い|実際は|すでに|既に|発言している|話している)/;
  const unseen = /(?:未発言|まだ.{0,5}(?:発言|話)(?:していない|してません)|(?:発言|話)を(?:聞けていない|聞いていない))/;
  for (const player of context.players) {
    if (player.seat === context.actor.seat || remainingSeats.has(player.seat)) continue;
    const references = [
      nameForSeat(context, player.seat),
      ...nameForSeat(context, player.seat).split(/\s+/),
      addressForSeat(context, player.seat),
    ]
      .map(escapePattern).join('|');
    const reference = new RegExp(`(?:${references})`);
    const offending = speech.split(/[。！？\n]/).find((sentence) =>
      reference.test(sentence) && unseen.test(sentence) && !correction.test(sentence));
    if (offending) {
      throw new ClaimContractError(
        'spoken_player_treated_as_unspoken',
        `${nameForSeat(context, player.seat)}は今日すでに発言しています。「未発言」「発言がない」「発言を聞けていない」と扱わず、内容を評価するなら実際の公開発言を指してください。`,
      );
    }
  }
}

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
  return speech.includes(nameForSeat(context, seat)) || speech.includes(addressForSeat(context, seat));
}

function validateDiscussionStructure(context: DecisionContext, decision: SpeechDecision): void {
  if (decision.requestsReply && decision.addressedTo === null) {
    decision.requestsReply = false;
  }
  if (context.discussion?.version !== 'v3') return;
  const structure = decision.structure;
  if (!structure) throw new ClaimContractError('discussion_structure_missing', 'structureを省略せず、実際の発言内容を自己分類してください。');
  // structureの付随メタデータだけが矛盾した場合は、台詞を捨ててAPIを
  // 再試行せず、安全側へ正規化する。役職主張や秘密情報の契約はこの後も厳格に検証する。
  if (decision.requestsReply && structure.questionTopic === null) {
    decision.requestsReply = false;
  }
  if (structure.primaryAct === 'suspicion' && structure.suspicion === null) {
    structure.primaryAct = 'other';
  }
  if (structure.primaryAct === 'vote_intent' && structure.voteIntent === null) {
    structure.primaryAct = 'other';
  }
  if (decision.claim && structure.primaryAct !== 'role_claim') {
    structure.primaryAct = 'role_claim';
  }
  if (decision.requestsReply && structure.questionTopic &&
    context.discussion.closedQuestionTopics?.includes(structure.questionTopic)) {
    throw new ClaimContractError(
      'closed_question_topic_repeated',
      `質問分類${structure.questionTopic}はすでに十分に尋ねられています。返答要求を繰り返さず、別の評価・反論・投票方針を話してください。`,
    );
  }
  if (context.day === 1 && context.discussion.stage === 'opening') {
    const firstPerson = characterForSeat(context.characters, context.actor.seat).firstPerson;
    const fabricatedPublicAction = new RegExp(`${firstPerson}(?:が|は)[^。！？\\n]{0,32}(?:質問した|反応を求めた|疑った|指摘した|保留した|投票予定を示した|投票すると言った)`);
    if (fabricatedPublicAction.test(decision.speech)) {
      throw new ClaimContractError(
        'opening_self_history_fabrication',
        'これは今日の最初の発言です。他者の質問・反応要求・疑い・保留・投票予定を、自分がすでに行ったこととして語らないでください。誰がした行動か主語を保ってください。',
      );
    }
  }
  if (!context.discussion.priorVoteIntentTarget &&
    /(?:私|わたし|あたし|うち|俺|わし)(?:は|も)[^。！？\n]{0,32}(?:投票予定|投票先|票を入れる相手)[^。！？\n]{0,16}(?:変えない|変えません|維持する|そのまま|のまま|続ける)/.test(decision.speech)) {
    throw new ClaimContractError(
      'nonexistent_prior_vote_intent',
      'あなたは今日まだ投票予定を公表していません。初めて示す予定を「変えない」「維持する」「このまま」と過去から継続しているように話さず、新しい予定として述べてください。',
    );
  }
  if (structure.suspicion && !mentionsSeat(context, decision.speech, structure.suspicion.targetSeat)) {
    // 本文に裏付けのない公開メタデータは台帳へ載せない。本文を推測で解析して
    // 別の席へ付け替えるより、構造だけを安全側へ落とす方が確実である。
    structure.suspicion = null;
    if (structure.primaryAct === 'suspicion') structure.primaryAct = 'other';
  }
  if (structure.suspicion) {
    const { basis, evidenceDay } = structure.suspicion;
    if (typeof evidenceDay === 'number' && evidenceDay > context.day) {
      structure.suspicion = null;
      if (structure.primaryAct === 'suspicion') structure.primaryAct = 'other';
    }
    if (structure.suspicion && basis === 'intuition' && evidenceDay !== null && evidenceDay !== undefined) {
      structure.suspicion.evidenceDay = null;
    } else if (structure.suspicion && basis !== 'intuition' && evidenceDay === null) {
      structure.suspicion = null;
      if (structure.primaryAct === 'suspicion') structure.primaryAct = 'other';
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
      sentence.includes(nameForSeat(context, consensusTarget)) || sentence.includes(addressForSeat(context, consensusTarget)));
    const repeatsConsensusDeclaration = sentences.some((sentence) =>
      /(?:私|わたし|あたし|うち|僕|俺|わし|自分|今日は|今は).{0,36}(?:投票|票を入れ|に入れ|処刑する|吊る)|(?:投票|票を入れ|に入れ).{0,18}(?:予定|つもり)/.test(sentence));
    if (repeatsConsensusDeclaration) {
      throw new ClaimContractError(
        'consensus_vote_declaration_repeated',
        `${nameForSeat(context, consensusTarget)}への投票予定はすでに3人以上が公表しています。この発言では同じ予定を追加宣言せず、voteIntent=nullにして、増えた公開情報、質問、反証、または未検討の人物を話してください。最終投票先は別途選べます。`,
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
  if (structure.primaryAct === 'answer' && structure.questionTopic === null) {
    structure.primaryAct = 'other';
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
    if (directive.strategicChoice && directive.options?.length && directive.personalityContext) {
      const strategy = characterClaimStrategy(context.characters, context.actor.seat);
      const relevant = context.actor.role === 'seer'
        ? strategy.trueSeer
        : context.actor.role === 'medium'
          ? strategy.trueMedium
          : context.actor.role === 'madman'
            ? strategy.madman
            : context.actor.role === 'werewolf'
              ? strategy.werewolf
              : null;
      const situation = directive.personalityContext;
      const timingLabels = { early: '自分から早め', responsive: '公開状況の変化へ反応', patient: '必要になるまで慎重に待つ' } as const;
      const pressureLabels = { withdraw: '圧力を受けるほど露出を避ける', deliberate: '圧力の利益と危険を比較する', confront: '圧力へ正面から対抗する' } as const;
      const scale = '尺度の意味は、0〜19=ほぼ選ばない、20〜39=明確な非常時だけ、40〜59=利益と代償を具体的に比較、60〜79=条件が合えば積極的、80〜100=人格として強く好む、です。これは乱数確率ではありません。';
      const roleCounts = `現在の公開CO人数は占い師${situation.existingRoleClaims.seer}人、霊媒師${situation.existingRoleClaims.medium}人です。`;
      const optionDescriptions = directive.options.map((option) => {
        const count = situation.existingRoleClaims[option.claimedRole];
        const roleLabel = option.claimedRole === 'seer' ? '占い師' : '霊媒師';
        const roleClaimSentence = characterRoleClaimSentence(context.characters, context.actor.seat, roleLabel);
        const results = option.results.map((result) =>
          `${result.day}日目の${addressForSeat(context, result.targetSeat)}=${result.verdict}`).join('、') || '結果なし';
        return `${option.claimedRole}: 今名乗ると${count + 1}人目。「${roleClaimSentence}」・${results}`;
      }).join(' / ');
      const personality = relevant && 'claimTendency' in relevant
        ? [
            `騙り意欲=${relevant.claimTendency}/100（同役職COが0人のとき）`,
            `対抗意欲=${relevant.counterclaimTendency}/100（自分が2人目になるときだけ）`,
            `混雑許容=${relevant.crowdingTolerance}/100（自分が3人目以降になるとき。ここでは対抗意欲よりこちらを優先）`,
            `注目耐性=${relevant.spotlightTolerance}/100`,
            `自己保全=${relevant.selfPreservationTendency}/100`,
            `圧力反応=${pressureLabels[relevant.pressureResponse]}`,
            `好む騙り=${relevant.preferredRole}`,
            `時機=${timingLabels[relevant.timing]}`,
            ...('teamExposureConcern' in relevant ? [`仲間側の露出警戒=${relevant.teamExposureConcern}/100（高いほど自分は潜伏）`] : []),
          ].join('、')
        : relevant && 'revealTendency' in relevant
          ? `結果を持つ時の公開意欲=${relevant.revealTendency}/100、結果がない時の肩書公開意欲=${relevant.emptyResultRevealTendency}/100、注目耐性=${relevant.spotlightTolerance}/100、時機=${timingLabels[relevant.timing]}`
          : '';
      const trueRoleSituation = relevant && 'revealTendency' in relevant
        ? directive.options.some((option) => option.results.length > 0)
          ? `今回は公表できる結果があるため、主に結果あり公開意欲=${relevant.revealTendency}/100を使います。`
          : `今回は公表できる結果がないため、結果あり公開意欲は使わず、結果なし公開意欲=${relevant.emptyResultRevealTendency}/100を主な決定値にします。0〜39なら、同役職対抗・公開期限・本人への強い圧力がない限り、肩書だけを出す一般セオリーを人格より優先せず、待機または潜伏を基本にしてください。`
        : '';
      const action = directive.mode === 'must'
        ? '今回は公開期限・能力結果・真役職対抗のいずれかにより名乗る必要があります。認可候補から選び、claimIntent.action=claim_nowにしてください。'
        : '候補があること自体を名乗る理由にしないでください。今名乗る利益と、注目・混雑・仲間側露出という人格上の代償を比較し、claim_now、公開条件付きのwait、この試合では潜伏するstay_hiddenから選んでください。';
      const intent = 'claimIntent.basisには今回の決定打を一つだけ指定します。名乗るならclaimとplannedRoleを一致させ、待つなら再検討中の役職と公開triggerを指定し、潜伏ならplannedRole=null、trigger=noneにします。basisやこの判断過程は台詞へ出しません。';
      const prior = directive.priorIntent
        ? `以前の非公開方針は action=${directive.priorIntent.action}、plannedRole=${directive.priorIntent.plannedRole ?? 'null'}、trigger=${directive.priorIntent.trigger}、basis=${directive.priorIntent.basis ?? '未記録'}です。公開状況が変わっていないのに反転しないでください。`
        : '以前の非公開方針はありません。';
      const crowding = directive.options.some((option) => situation.existingRoleClaims[option.claimedRole] >= 2)
        ? '3人目以降のCOは通常の対抗ではなく、処刑候補と露出を増やす別の賭けです。混雑許容が高い人物、強い自己保全、または人物固有の明確な狙いがない限り、単に対抗がいるという理由で選ばないでください。'
        : '';
      const nightZero = directive.options.some((option) => option.claimedRole === 'seer' && option.results.some((result) => result.day === 0))
        ? '0日目は無情報選択なので、占い先を選んだ推理上の理由を作ってはいけません。'
        : '';
      return [
        '役職主張は一般セオリーの模範解答ではなく、この人物が同じ状況で繰り返し選びそうな行動として決めてください。',
        scale,
        roleCounts,
        `自分への公開上の人狼判定=${situation.actorBlackened ? 'あり' : 'なし'}。`,
        personality,
        trueRoleSituation,
        relevant?.guidance ?? '',
        `主張を維持する方針: ${strategy.consistency}`,
        `今回認可された候補: ${optionDescriptions}。`,
        crowding,
        action,
        intent,
        prior,
        nightZero,
        '名乗る場合だけ、候補の対象・日・判定を変えず本文とclaimへ過不足なく入れてください。認可候補、数値、claimIntentという仕組み自体は台詞へ出さないでください。',
      ].filter(Boolean).join(' ');
    }
    if (directive.strategicChoice && directive.options?.length) {
      const strategy = characterClaimStrategy(context.characters, context.actor.seat);
      const relevant = context.actor.role === 'seer'
        ? strategy.trueSeer
        : context.actor.role === 'medium'
          ? strategy.trueMedium
          : context.actor.role === 'madman'
            ? strategy.madman
            : context.actor.role === 'werewolf'
              ? strategy.werewolf
              : null;
      const timingLabels = { early: '早め', responsive: '公開状況へ反応', patient: '慎重に待つ' } as const;
      const tendency = relevant && 'revealTendency' in relevant
        ? `公開意欲=${relevant.revealTendency}/100、時機=${timingLabels[relevant.timing]}`
        : relevant && 'claimTendency' in relevant
          ? `騙り意欲=${relevant.claimTendency}/100、対抗意欲=${relevant.counterclaimTendency}/100、好む騙り=${relevant.preferredRole}、時機=${timingLabels[relevant.timing]}`
          : '';
      const optionDescriptions = directive.options.map((option) => {
        const roleLabel = option.claimedRole === 'seer' ? '占い師' : '霊媒師';
        const roleClaimSentence = characterRoleClaimSentence(context.characters, context.actor.seat, roleLabel);
        const results = option.results.map((result) =>
          `${result.day}日目の${addressForSeat(context, result.targetSeat)}=${result.verdict}`).join('、') || '結果なし';
        return `${option.claimedRole}:「${roleClaimSentence}」・${results}`;
      }).join(' / ');
      const action = directive.mode === 'must'
        ? '今回は公開期限または能力結果・対抗状況により、認可候補から一つを必ず選んで名乗ってください。claimIntent.action=claim_now、plannedRole=実際に名乗る役職、claim=対応する候補にします。'
        : '今回は人格と現在の公開盤面から、今名乗る、条件を決めて待つ、この試合では潜伏する、のいずれかをあなた自身で選んでください。これは確率抽選ではありません。';
      const intent = directive.mode === 'must' ? '' : '今名乗るならclaimIntent.action=claim_nowとclaimを一致させます。待つならaction=wait、plannedRoleに検討中の役職、triggerに再検討条件を設定し、claim=nullにします。潜伏を決めるならaction=stay_hidden、plannedRole=null、trigger=none、claim=nullです。';
      const prior = directive.priorIntent
        ? `以前の非公開方針は action=${directive.priorIntent.action}、plannedRole=${directive.priorIntent.plannedRole ?? 'null'}、trigger=${directive.priorIntent.trigger} です。公開状況が変わった理由なしに気まぐれで反転しないでください。`
        : '以前の非公開方針はありません。';
      const resultLanguage = '名乗る場合は、候補の対象・日・判定を変えず、本文とclaimの両方へ過不足なく入れてください。「人狼ではない」は人物の口調に合う自然な過去形へ活用してください。';
      const nightZero = directive.options.some((option) => option.claimedRole === 'seer' && option.results.some((result) => result.day === 0))
        ? '0日目は無情報選択なので、占い先を選んだ推理上の理由を作ってはいけません。'
        : '';
      return [
        '役職を名乗るかどうかはエンジンが決めた台本ではなく、この人物の人格と盤面に基づくあなたの非公開戦術判断です。',
        tendency,
        relevant?.guidance ?? '',
        `主張を維持する方針: ${strategy.consistency}`,
        `今回認可された候補: ${optionDescriptions}。`,
        action,
        intent,
        prior,
        resultLanguage,
        nightZero,
        'claimIntentや認可候補という仕組み自体は台詞へ出さないでください。',
      ].filter(Boolean).join(' ');
    }
    const roleLabel = directive.claimedRole === 'seer' ? '占い師' : '霊媒師';
    const roleClaimSentence = characterRoleClaimSentence(context.characters, context.actor.seat, roleLabel);
    const results = directive.results.map((result) =>
      `${result.day}日目の${addressForSeat(context, result.targetSeat)}の結果は${result.verdict}`).join('、');
    const action = directive.mode === 'must'
      ? `今回は必ず「${roleClaimSentence}」と人物らしく名乗り`
      : `今回は「${roleClaimSentence}」と人物らしく名乗っても、まだ伏せても構いません。伏せる場合はclaimをnullにし、能力結果、確認済みの正体、結果を持っている事実を本文にも匂わせないでください。名乗る場合は`;
    const dayOneSeerDefault = directive.mode === 'may' && context.actor.role === 'seer' && context.day === 1
      ? '一般的な9人人狼では、人狼ではないという結果も候補を狭める公開材料になるため、1日目に占い師だと名乗って結果を出すのが基本です。伏せるのは、人物像と今の盤面に明確な理由がある例外にしてください。'
      : '';
    const nightZeroGuidance = directive.claimedRole === 'seer' && directive.results.some((result) => result.day === 0)
      ? '0日目は誰も発言していないため、占い先を選んだ推理上の理由を作って話してはいけません。理由を聞かれたら「情報がない時点の選択なので理由はない」と自然に答えてください。人物像にある占い先選びの基準は1日目の夜以降だけに当てはまります。'
      : '';
    return `${action}、claimにもclaimedRole=${directive.claimedRole}を設定してください。${results ? `認可された結果は「${results}」です。結果を対象・日・判定ごと変えず、本文とclaimの両方へ過不足なく入れてください。判定の意味を保ったまま、「人狼ではない」は「人狼ではありませんでした」「人狼じゃなかったよ」など人物の口調に合う自然な過去形へ活用し、「人狼ではない、でした」のように判定語をつなぎ合わせないでください。` : '結果一覧は空のままにしてください。'} ${dayOneSeerDefault} ${nightZeroGuidance} この主張指示や仕組み自体には言及しないでください。`;
  }
  if (context.kind !== 'speech' || !['seer', 'medium'].includes(context.actor.role)) return null;
  const roleLabel = ROLE_LABEL[context.actor.role];
  if (publicRoleClaimExists(context, roleLabel)) {
    return `あなたはすでに自分が${roleLabel}だと明かしています。能力結果を話すときは、自分が知った結果と推理を区別してください。`;
  }
  const roleClaimSentence = characterRoleClaimSentence(context.characters, context.actor.seat, roleLabel as '占い師' | '霊媒師');
  return `能力結果を初めて公開する場合は、結果だけを断定せず、必ず同じ発言内で「${roleClaimSentence}」と人物らしい自然な日本語で名乗ってから対象と結果を伝えてください。結果を伏せるなら役職を名乗る必要はありません。`;
}

export function validateSpeechDisclosure(context: DecisionContext, decision: SpeechDecision): void {
  validateSelfReference(context, decision.speech);
  validateNightZeroReasonBoundary(context, decision.speech);
  validateSpokenState(context, decision.speech);
  validateNaturalAlignmentTerms(decision.speech);
  validateDiscussionStructure(context, decision);
  if (abbreviatedRoleClaim.test(decision.speech)) throw new Error('Speech parse validation failed: abbreviated role claim is forbidden');
  if (context.claimDirective) {
    assertClaimWithinDirective(decision.claim, context.claimDirective);
    assertClaimIntentWithinDirective(decision.claimIntent, decision.claim, context.claimDirective);
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
      const name = nameForSeat(context, result.targetSeat);
      const address = addressForSeat(context, result.targetSeat);
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
