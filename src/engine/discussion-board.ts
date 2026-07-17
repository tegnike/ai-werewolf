import type { Player, QuestionTopic, SeatId, SpeechAct, SpeechStructure, SuspicionBasis } from '@/domain/types';

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

export function closedQuestionTopics(board: DiscussionBoard, limit = 2): QuestionTopic[] {
  return Object.entries(board.questions)
    .filter(([, count]) => Number(count) >= limit)
    .map(([topic]) => topic as QuestionTopic);
}

export function discussionBoardDigest(board: DiscussionBoard, players: Player[]): string[] {
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
  if (board.voteIntents.length > 0) {
    digest.push(`投票予定の宣言: ${board.voteIntents.map((entry) => `${names.get(entry.sourceSeat)}→${names.get(entry.targetSeat)}`).join('、')}`);
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
  const voteTally = new Map<SeatId, number>();
  for (const entry of board.voteIntents) voteTally.set(entry.targetSeat, (voteTally.get(entry.targetSeat) ?? 0) + 1);
  const consensus = [...voteTally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (consensus && consensus[1] >= 3) {
    agenda.push(`${names.get(consensus[0])}への投票予定が${consensus[1]}人へ集中している。同じ理由で追従せず、対立候補、反証、または役職外の別候補を一つ比較する`);
  }
  const mentioned = new Set(board.suspicions.map((entry) => entry.targetSeat));
  const unexamined = aliveOthers.filter((player) => !mentioned.has(player.seat)).slice(0, 3);
  if (unexamined.length > 0) agenda.push(`${unexamined.map((player) => player.name).join('、')}のうち一人について、発言を根拠に暫定評価を出す`);
  if (board.boardAnalyses === 0 && turn >= 5) agenda.push('現在の役職主張数と、今日は役職候補・その他の誰から処刑候補を選ぶかを整理する');
  if ((board.acts.suspicion ?? 0) < 4) agenda.push('質問だけで終えず、自分が今もっとも疑う相手と根拠を一つ示す');
  if (turn >= 10 && (board.acts.vote_intent ?? 0) < 3) agenda.push('現時点の投票予定を一人に絞り、後で変える条件も短く示す');
  return agenda.slice(0, 3);
}
