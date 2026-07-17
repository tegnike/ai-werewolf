import { describe, expect, it } from 'vitest';
import { setupPlayers } from '@/engine/setup';
import {
  closedQuestionTopics, discussionAgenda, discussionBoardDigest, emptyDiscussionBoard, foldDiscussionBoard, suspicionCountFor,
} from '@/engine/discussion-board';

describe('discussion v3 board', () => {
  it('質問・回答・疑い・投票予定を公開構造だけから畳み込む', () => {
    const players = setupPlayers('discussion-board');
    let board = emptyDiscussionBoard();
    board = foldDiscussionBoard(board, 'seat-1', {
      primaryAct: 'question', questionTopic: 'inspection_reason',
      suspicion: { targetSeat: 'seat-5', basis: 'role_claim' }, voteIntent: null, boardAnalysis: false,
    }, true);
    board = foldDiscussionBoard(board, 'seat-2', {
      primaryAct: 'answer', questionTopic: 'inspection_reason', suspicion: null, voteIntent: null, boardAnalysis: false,
    });
    board = foldDiscussionBoard(board, 'seat-3', {
      primaryAct: 'vote_intent', questionTopic: null,
      suspicion: { targetSeat: 'seat-5', basis: 'interaction' }, voteIntent: 'seat-5', boardAnalysis: true,
    });

    expect(suspicionCountFor(board, 'seat-5')).toBe(2);
    expect(discussionBoardDigest(board, players).join('\n')).toContain('inspection_reason=1回（回答1回）');
    expect(discussionBoardDigest(board, players).join('\n')).toContain('2人から');
    expect(discussionAgenda(board, players, 'seat-5', 11)).toContain('自分へ出た疑いのうち一つを具体的に認めるか反論し、疑い返しだけで終えない');
    expect(closedQuestionTopics(board)).toEqual([]);
    board = foldDiscussionBoard(board, 'seat-4', {
      primaryAct: 'question', questionTopic: 'inspection_reason', suspicion: null, voteIntent: null, boardAnalysis: false,
    }, true);
    expect(closedQuestionTopics(board)).toEqual(['inspection_reason']);
  });
});
