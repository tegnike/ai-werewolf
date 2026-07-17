import type { ClaimLedger } from '@/domain/claims';
import type { CandidateEvidenceEntry, Player, QuestionTopic, SeatId, SpeechAct, SpeechStructure, SuspicionBasis } from '@/domain/types';

interface SuspicionEntry { sourceSeat: SeatId; targetSeat: SeatId; basis: SuspicionBasis }
interface VoteIntentEntry { sourceSeat: SeatId; targetSeat: SeatId }

export interface DiscussionBoard {
  acts: Partial<Record<SpeechAct, number>>;
  questions: Partial<Record<QuestionTopic, number>>;
  answers: Partial<Record<QuestionTopic, number>>;
  suspicions: SuspicionEntry[];
  voteIntents: VoteIntentEntry[];
  boardAnalyses: number;
}

export function emptyDiscussionBoard(): DiscussionBoard {
  return { acts: {}, questions: {}, answers: {}, suspicions: [], voteIntents: [], boardAnalyses: 0 };
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
    suspicions: structure.suspicion
      ? [...board.suspicions, { sourceSeat, ...structure.suspicion }]
      : board.suspicions,
    voteIntents: structure.voteIntent
      ? [...board.voteIntents.filter((entry) => entry.sourceSeat !== sourceSeat), { sourceSeat, targetSeat: structure.voteIntent }]
      : board.voteIntents,
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
    for (const suspicion of suspicions) bases[suspicion.basis] = (bases[suspicion.basis] ?? 0) + 1;
    return {
      targetSeat,
      suspicionSpeakers: new Set(suspicions.map((entry) => entry.sourceSeat)).size,
      voteIntentSpeakers: voteIntentCountFor(board, targetSeat),
      suspicionBases: bases,
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

export function closedQuestionTopics(board: DiscussionBoard, limit = 2): QuestionTopic[] {
  return Object.entries(board.questions)
    .filter(([, count]) => Number(count) >= limit)
    .map(([topic]) => topic as QuestionTopic);
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
      return `${names.get(entry.targetSeat)}（投票予定${entry.voteIntentSpeakers}人、疑い${entry.suspicionSpeakers}人、根拠${bases}、役職結果${results}）`;
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
): string[] {
  const aliveOthers = players.filter((player) => player.alive && player.seat !== actorSeat);
  const names = nameBySeat(players);
  const agenda: string[] = [];
  if (promptedBySeat) agenda.push(`${names.get(promptedBySeat)}の直近の質問へ、まず自分の立場を明確に答える`);
  if (suspicionCountFor(board, actorSeat) >= 2) agenda.push('自分へ出た疑いのうち一つを具体的に認めるか反論し、疑い返しだけで終えない');
  const consensus = consensusVoteTarget(board);
  if (consensus) {
    agenda.push(`${names.get(consensus)}への投票予定はすでに3人以上から公表されたため同じ予定を追加宣言せず、人数を根拠にしない。増えた公開情報、被疑者への質問、反証、または未検討の人物を話す`);
  }
  const mentioned = new Set(board.suspicions.map((entry) => entry.targetSeat));
  const unexamined = aliveOthers.filter((player) => !mentioned.has(player.seat)).slice(0, 3);
  if (unexamined.length > 0) agenda.push(`${unexamined.map((player) => player.name).join('、')}のうち一人について、発言を根拠に暫定評価を出す`);
  if (board.boardAnalyses === 0 && turn >= 5) agenda.push('現在の役職主張数と、今日は役職候補・その他の誰から処刑候補を選ぶかを整理する');
  if ((board.acts.suspicion ?? 0) < 4) agenda.push('質問だけで終えず、自分が今もっとも疑う相手と根拠を一つ示す');
  if (turn >= 10 && (board.acts.vote_intent ?? 0) < 3) agenda.push('現時点の投票予定を一人に絞り、後で変える条件も短く示す');
  return agenda.slice(0, 3);
}
