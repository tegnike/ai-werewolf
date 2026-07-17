import { describe, expect, it } from 'vitest';
import { setupPlayers } from '@/engine/setup';
import {
  candidateEvidenceLedger, closedQuestionTopics, consensusVoteTarget, discussionAgenda, discussionBoardDigest,
  emptyDiscussionBoard, foldDiscussionBoard, priorVoteIntentFor, suspicionCountFor, voteIntentCountFor,
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

  it('投票予定の頭数だけでなく根拠と公開役職結果を候補別に示す', () => {
    const players = setupPlayers('evidence-ledger');
    let board = emptyDiscussionBoard();
    for (const sourceSeat of ['seat-1', 'seat-2', 'seat-3'] as const) {
      board = foldDiscussionBoard(board, sourceSeat, {
        primaryAct: 'vote_intent', questionTopic: null,
        suspicion: { targetSeat: 'seat-5', basis: sourceSeat === 'seat-1' ? 'result' : 'vote_plan' },
        voteIntent: 'seat-5', boardAnalysis: false,
      });
    }
    const claims = [{
      seat: 'seat-1' as const, name: players[0].name, claimedRole: 'seer' as const,
      coDay: 1, coStage: 'opening' as const,
      results: [{ day: 0, targetSeat: 'seat-5' as const, verdict: '人狼' as const, announcedDay: 1 }],
    }];

    expect(voteIntentCountFor(board, 'seat-5')).toBe(3);
    expect(consensusVoteTarget(board)).toBe('seat-5');
    expect(priorVoteIntentFor(board, 'seat-2')).toBe('seat-5');
    expect(candidateEvidenceLedger(board, claims)[0]).toMatchObject({
      targetSeat: 'seat-5', voteIntentSpeakers: 3, suspicionSpeakers: 3,
      suspicionBases: { result: 1, vote_plan: 2 },
      claimedResults: [{ sourceSeat: 'seat-1', claimedRole: 'seer', verdict: '人狼' }],
    });
    const digest = discussionBoardDigest(board, players, claims).join('\n');
    expect(digest).toContain('候補別の公開材料');
    expect(digest).toContain('投票予定3人');
    expect(digest).toContain('役職結果');
    expect(discussionAgenda(board, players, 'seat-4', 10).join('\n')).toContain('人数を根拠にしない');
  });
});
