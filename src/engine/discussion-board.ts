import type { ClaimLedger } from '@/domain/claims';
import type { CandidateEvidenceEntry, DiscussionContext, Player, PublicCommitment, QuestionTopic, SeatId, SpeechAct, SpeechStructure, SuspicionBasis } from '@/domain/types';

interface SuspicionEntry {
  sourceSeat: SeatId;
  targetSeat: SeatId;
  basis: SuspicionBasis;
  echoSourceSeat?: SeatId | null;
}
interface VoteIntentEntry { sourceSeat: SeatId; targetSeat: SeatId }
interface AnswerEntry { sourceSeat: SeatId; topic: QuestionTopic }

export interface DiscussionBoard {
  acts: Partial<Record<SpeechAct, number>>;
  questions: Partial<Record<QuestionTopic, number>>;
  answers: Partial<Record<QuestionTopic, number>>;
  answerEntries: AnswerEntry[];
  suspicions: SuspicionEntry[];
  voteIntents: VoteIntentEntry[];
  defendedSeats: SeatId[];
  boardAnalyses: number;
}

export function emptyDiscussionBoard(): DiscussionBoard {
  return {
    acts: {}, questions: {}, answers: {}, answerEntries: [], suspicions: [], voteIntents: [],
    defendedSeats: [], boardAnalyses: 0,
  };
}

function increment<T extends string>(record: Partial<Record<T, number>>, key: T): Partial<Record<T, number>> {
  return { ...record, [key]: (record[key] ?? 0) + 1 };
}

export function foldDiscussionBoard(
  board: DiscussionBoard,
  sourceSeat: SeatId,
  structure: SpeechStructure,
  requestsReply = false,
): DiscussionBoard {
  const questions = structure.questionTopic && structure.primaryAct !== 'answer' &&
    (structure.primaryAct === 'question' || requestsReply)
    ? increment(board.questions, structure.questionTopic)
    : board.questions;
  const answers = structure.questionTopic && structure.primaryAct === 'answer'
    ? increment(board.answers, structure.questionTopic)
    : board.answers;
  return {
    acts: increment(board.acts, structure.primaryAct),
    questions,
    answers,
    answerEntries: structure.questionTopic && structure.primaryAct === 'answer'
      ? [...board.answerEntries, { sourceSeat, topic: structure.questionTopic }]
      : board.answerEntries,
    suspicions: structure.suspicion
      ? [...board.suspicions, { sourceSeat, ...structure.suspicion }]
      : board.suspicions,
    voteIntents: structure.voteIntent
      ? [...board.voteIntents.filter((entry) => entry.sourceSeat !== sourceSeat), { sourceSeat, targetSeat: structure.voteIntent }]
      : board.voteIntents,
    defendedSeats: structure.primaryAct === 'defense' && !board.defendedSeats.includes(sourceSeat)
      ? [...board.defendedSeats, sourceSeat]
      : board.defendedSeats,
    boardAnalyses: board.boardAnalyses + Number(structure.boardAnalysis),
  };
}

function nameBySeat(players: Player[]): Map<SeatId, string> {
  return new Map(players.map((player) => [player.seat, player.name]));
}

export function suspicionCountFor(board: DiscussionBoard, seat: SeatId): number {
  return new Set(board.suspicions.filter((entry) => entry.targetSeat === seat).map((entry) => entry.sourceSeat)).size;
}

export function voteIntentCountFor(board: DiscussionBoard, seat: SeatId): number {
  return board.voteIntents.filter((entry) => entry.targetSeat === seat).length;
}

export function priorVoteIntentFor(board: DiscussionBoard, seat: SeatId): SeatId | undefined {
  return board.voteIntents.find((entry) => entry.sourceSeat === seat)?.targetSeat;
}

export function sanitizeEchoSourceSeat(
  board: DiscussionBoard,
  claims: ClaimLedger,
  actorSeat: SeatId,
  structure: SpeechStructure,
): SpeechStructure {
  const suspicion = structure.suspicion;
  if (!suspicion?.echoSourceSeat) return structure;
  const sourceSeat = suspicion.echoSourceSeat;
  const citesPriorSuspicion = board.suspicions.some((entry) =>
    entry.sourceSeat === sourceSeat && entry.targetSeat === suspicion.targetSeat);
  const citesPublicResult = claims.some((claim) => claim.seat === sourceSeat &&
    claim.results.some((result) => result.targetSeat === suspicion.targetSeat));
  if (sourceSeat !== actorSeat && (citesPriorSuspicion || citesPublicResult)) return structure;
  return { ...structure, suspicion: { ...suspicion, echoSourceSeat: null } };
}

export function consensusVoteTarget(board: DiscussionBoard, minimum = 3): SeatId | undefined {
  const tally = new Map<SeatId, number>();
  for (const entry of board.voteIntents) tally.set(entry.targetSeat, (tally.get(entry.targetSeat) ?? 0) + 1);
  const first = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return first && first[1] >= minimum ? first[0] : undefined;
}

export function candidateEvidenceLedger(board: DiscussionBoard, claims: ClaimLedger = []): CandidateEvidenceEntry[] {
  const targets = new Set<SeatId>([
    ...board.suspicions.map((entry) => entry.targetSeat),
    ...board.voteIntents.map((entry) => entry.targetSeat),
    ...claims.flatMap((entry) => entry.results.map((result) => result.targetSeat)),
  ]);
  const sameRoleCounts = new Map<'seer' | 'medium', number>();
  for (const claim of claims) sameRoleCounts.set(claim.claimedRole, (sameRoleCounts.get(claim.claimedRole) ?? 0) + 1);
  return [...targets].map((targetSeat) => {
    const bases: Partial<Record<SuspicionBasis, number>> = {};
    const suspicions = board.suspicions.filter((entry) => entry.targetSeat === targetSeat);
    for (const basis of new Set(suspicions.map((entry) => entry.basis))) {
      bases[basis] = new Set(suspicions
        .filter((entry) => entry.basis === basis)
        .map((entry) => entry.sourceSeat)).size;
    }
    return {
      targetSeat,
      suspicionSpeakers: new Set(suspicions.map((entry) => entry.sourceSeat)).size,
      voteIntentSpeakers: voteIntentCountFor(board, targetSeat),
      suspicionBases: bases,
      echoSpeakers: new Set(suspicions
        .filter((entry) => entry.echoSourceSeat != null)
        .map((entry) => entry.sourceSeat)).size,
      distinctBases: Object.keys(bases).length,
      claimedResults: claims.flatMap((claim) => claim.results
        .filter((result) => result.targetSeat === targetSeat)
        .map((result) => ({
          sourceSeat: claim.seat,
          claimedRole: claim.claimedRole,
          verdict: result.verdict,
          sameRoleClaimants: sameRoleCounts.get(claim.claimedRole) ?? 1,
        }))),
    };
  }).sort((a, b) =>
    b.voteIntentSpeakers - a.voteIntentSpeakers ||
    b.suspicionSpeakers - a.suspicionSpeakers ||
    a.targetSeat.localeCompare(b.targetSeat));
}

export function saturatedPointFor(
  board: DiscussionBoard,
  minimumSpeakers = 3,
  minimumEchoSpeakers = 2,
): DiscussionContext['saturatedPoint'] {
  const points = new Map<string, { targetSeat: SeatId; basis: SuspicionBasis; sources: Set<SeatId>; echoes: Set<SeatId> }>();
  for (const suspicion of board.suspicions.filter((entry) => entry.basis !== 'result')) {
    const key = `${suspicion.targetSeat}/${suspicion.basis}`;
    const point = points.get(key) ?? {
      targetSeat: suspicion.targetSeat,
      basis: suspicion.basis,
      sources: new Set<SeatId>(),
      echoes: new Set<SeatId>(),
    };
    point.sources.add(suspicion.sourceSeat);
    if (suspicion.echoSourceSeat != null) point.echoes.add(suspicion.sourceSeat);
    points.set(key, point);
  }
  const candidates = [...points.values()]
    .map((point) => ({
      targetSeat: point.targetSeat,
      basis: point.basis,
      speakers: point.sources.size,
      echoSpeakers: point.echoes.size,
    }))
    .filter((entry) => entry.speakers >= minimumSpeakers || entry.echoSpeakers >= minimumEchoSpeakers)
    .sort((a, b) =>
      b.speakers - a.speakers ||
      b.echoSpeakers - a.echoSpeakers ||
      a.targetSeat.localeCompare(b.targetSeat) ||
      a.basis.localeCompare(b.basis));
  const first = candidates[0];
  return first ? { targetSeat: first.targetSeat, basis: first.basis, speakers: first.speakers } : undefined;
}

export function closedQuestionTopics(board: DiscussionBoard, limit = 2): QuestionTopic[] {
  return Object.entries(board.questions)
    .filter(([, count]) => Number(count) >= limit)
    .map(([topic]) => topic as QuestionTopic);
}

export function publicCommitmentsFor(board: DiscussionBoard): PublicCommitment[] {
  const seats = new Set<SeatId>([
    ...board.suspicions.map((entry) => entry.sourceSeat),
    ...board.voteIntents.map((entry) => entry.sourceSeat),
    ...board.answerEntries.map((entry) => entry.sourceSeat),
    ...board.defendedSeats,
  ]);
  return [...seats].sort().map((seat) => {
    const suspicions = board.suspicions.filter((entry) => entry.sourceSeat === seat);
    const latestSuspicion = suspicions.at(-1)?.targetSeat;
    const voteIntent = board.voteIntents.find((entry) => entry.sourceSeat === seat)?.targetSeat;
    return {
      seat,
      ...(latestSuspicion ? { suspicionTargetSeat: latestSuspicion } : {}),
      ...(suspicions.at(-1)?.basis ? { suspicionBasis: suspicions.at(-1)!.basis } : {}),
      ...(voteIntent ? { voteIntentTargetSeat: voteIntent } : {}),
      answeredTopics: [...new Set(board.answerEntries
        .filter((entry) => entry.sourceSeat === seat)
        .map((entry) => entry.topic))],
      defended: board.defendedSeats.includes(seat),
      changedSuspicion: new Set(suspicions.map((entry) => entry.targetSeat)).size >= 2,
    };
  });
}

export function discussionMaterialPhase(
  board: DiscussionBoard,
  claims: ClaimLedger,
  day: number,
  turn: number,
): NonNullable<DiscussionContext['materialPhase']> {
  if (turn >= 10) return 'decision';
  const independentSuspicionSources = new Set(board.suspicions.map((entry) => entry.sourceSeat)).size;
  const hasPublishedResult = claims.some((claim) => claim.results.length > 0);
  if (day === 1 && turn <= 6 && independentSuspicionSources < 2 && !hasPublishedResult) return 'scarce';
  return 'developing';
}

export function discussionBoardDigest(board: DiscussionBoard, players: Player[], claims: ClaimLedger = []): string[] {
  const names = nameBySeat(players);
  const digest: string[] = [];
  const questions = Object.entries(board.questions).filter(([, count]) => Number(count) > 0);
  if (questions.length > 0) {
    digest.push(`質問済み: ${questions.map(([topic, count]) => `${topic}=${count}回（回答${board.answers[topic as QuestionTopic] ?? 0}回）`).join('、')}`);
  }
  const suspicionTargets = [...new Set(board.suspicions.map((entry) => entry.targetSeat))];
  if (suspicionTargets.length > 0) {
    digest.push(`暫定的に疑われた人: ${suspicionTargets.map((seat) => `${names.get(seat)}=${suspicionCountFor(board, seat)}人から`).join('、')}`);
  }
  const evidence = candidateEvidenceLedger(board, claims).slice(0, 5);
  if (evidence.length > 0) {
    digest.push(`候補別の公開材料: ${evidence.map((entry) => {
      const bases = Object.entries(entry.suspicionBases).map(([basis, count]) => `${basis}=${count}`).join('・') || 'なし';
      const results = entry.claimedResults.map((result) =>
        `${names.get(result.sourceSeat)}の${result.claimedRole}主張=${result.verdict}${result.sameRoleClaimants > 1 ? `（同役職主張${result.sameRoleClaimants}人）` : ''}`).join('・') || 'なし';
      return `${names.get(entry.targetSeat)}（投票予定${entry.voteIntentSpeakers}人、疑い${entry.suspicionSpeakers}人、論点${entry.distinctBases}種:${bases}、同調${entry.echoSpeakers}人、役職結果${results}）`;
    }).join(' / ')}`);
  }
  const commitments = publicCommitmentsFor(board);
  if (commitments.length > 0) {
    digest.push(`今日すでに公開した立場: ${commitments.map((entry) => {
      const details = [
        entry.suspicionTargetSeat ? `疑い候補=${names.get(entry.suspicionTargetSeat)}` : null,
        entry.suspicionBasis ? `疑い根拠=${entry.suspicionBasis}` : null,
        entry.voteIntentTargetSeat ? `投票予定=${names.get(entry.voteIntentTargetSeat)}` : null,
        entry.answeredTopics.length > 0 ? `回答済み=${entry.answeredTopics.join('・')}` : null,
        entry.defended ? '弁明済み' : null,
        entry.changedSuspicion ? '候補更新済み' : null,
      ].filter(Boolean);
      return `${names.get(entry.seat)}（${details.join('、')}）`;
    }).join(' / ')}`);
  }
  const productive = ['suspicion', 'defense', 'vote_intent'] as const;
  digest.push(`今日の貢献数: ${productive.map((act) => `${act}=${board.acts[act] ?? 0}`).join('、')}、board_analysis=${board.boardAnalyses}`);
  return digest;
}

export function discussionAgenda(
  board: DiscussionBoard,
  players: Player[],
  actorSeat: SeatId,
  turn: number,
  promptedBySeat?: SeatId,
  spokenSeats: SeatId[] = [],
  claims: ClaimLedger = [],
  day = 1,
): string[] {
  const aliveOthers = players.filter((player) => player.alive && player.seat !== actorSeat);
  const names = nameBySeat(players);
  const spoken = new Set(spokenSeats);
  const materialPhase = discussionMaterialPhase(board, claims, day, turn);
  const agenda: string[] = [];
  if (promptedBySeat) agenda.push(`${names.get(promptedBySeat)}の直近の質問へ、まず自分の立場を明確に答える`);
  if (suspicionCountFor(board, actorSeat) >= 2) agenda.push('自分へ出た疑いのうち一つを具体的に認めるか反論し、疑い返しだけで終えない');
  const consensus = consensusVoteTarget(board);
  if (consensus) {
    agenda.push(`${names.get(consensus)}への投票予定はすでに3人以上から公表されたため同じ予定を追加宣言せず、人数を根拠にしない。増えた公開情報、被疑者への質問、反証、または未検討の人物を話す`);
  }
  const saturated = saturatedPointFor(board);
  if (saturated) {
    agenda.push(`${names.get(saturated.targetSeat)}への${saturated.basis}の疑いはすでに${saturated.speakers}人が述べた。同じ指摘の反復より、別の公開材料、2番手候補、本人の応答を比較する`);
  }
  const mentioned = new Set(board.suspicions.map((entry) => entry.targetSeat));
  const unexamined = aliveOthers.filter((player) => spoken.has(player.seat) && !mentioned.has(player.seat)).slice(0, 3);
  if (materialPhase !== 'scarce' && unexamined.length > 0) {
    const subjects = unexamined.length === 1
      ? unexamined[0].name
      : `${unexamined.map((player) => player.name).join('、')}のうち一人`;
    agenda.push(`${subjects}について発言内容を比べる。差がなければ疑いを作らず、保留理由と次に見る条件を示してよい`);
  }
  if (spoken.size === 0) agenda.push('公開済みの役職情報、自分がこの発言で公開する能力結果、前日までの発言がなければ、根拠のない疑い先や投票先を無理に作らず、確認したい論点・質問・判断基準を示す');
  if (spoken.size > 0 && materialPhase === 'scarce') {
    agenda.push('公開材料がまだ少ない。疑い先を無理に作らず、宛先つき質問、判断基準、役職の登場時機への意見、または再判断条件つきの保留を一つ示せば十分');
  }
  if (board.boardAnalyses === 0 && turn >= 5) agenda.push('現在の役職主張数と、今日は役職候補・その他の誰から処刑候補を選ぶかを整理する');
  if (materialPhase === 'developing' && (board.acts.suspicion ?? 0) < 4) {
    agenda.push('公開された発言や役職情報を二つ以上比べ、差があるなら暫定候補を示す。差がないなら、保留を解く条件を示す');
  }
  if (turn >= 10 && (board.acts.vote_intent ?? 0) < 3) agenda.push('現時点の投票予定を一人に絞り、後で変える条件も短く示す');
  return agenda.slice(0, 3);
}
