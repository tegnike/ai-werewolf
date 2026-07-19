import { describe, expect, it } from 'vitest';
import { setupPlayers } from '@/engine/setup';
import {
  candidateEvidenceLedger, closedQuestionTopics, consensusVoteTarget, discussionAgenda, discussionBoardDigest,
  discussionMaterialPhase, emptyDiscussionBoard, foldDiscussionBoard, priorVoteIntentFor, publicCommitmentsFor,
  sanitizeEchoSourceSeat, saturatedPointFor,
  suspicionCountFor, voteIntentCountFor,
} from '@/engine/discussion-board';

describe('discussion v3 board', () => {
  it('先頭発言者には根拠のない疑いを要求せず、評価候補を発言済みの人物に限る', () => {
    const players = setupPlayers('natural-first-speaker');
    const firstAgenda = discussionAgenda(emptyDiscussionBoard(), players, 'seat-4', 1, undefined, []);

    expect(firstAgenda.join('\n')).toContain('根拠のない疑い先や投票先を無理に作らず');
    expect(firstAgenda.join('\n')).not.toContain('もっとも疑う相手');
    expect(firstAgenda.join('\n')).not.toContain('名取 澪、八木 こはる、宮下 さくら');

    const secondAgenda = discussionAgenda(emptyDiscussionBoard(), players, 'seat-5', 2, undefined, ['seat-4']);
    expect(secondAgenda.join('\n')).toContain('公開材料がまだ少ない');
    expect(secondAgenda.join('\n')).toContain('疑い先を無理に作らず');
    expect(secondAgenda.join('\n')).not.toContain('雨宮 しずくについて');
    expect(secondAgenda.join('\n')).not.toContain('名取 澪');
  });

  it('序盤6turnまでは独立疑い2人または公開結果が出るまで自然な保留を許す', () => {
    const board = emptyDiscussionBoard();
    expect(discussionMaterialPhase(board, [], 1, 2)).toBe('scarce');
    expect(discussionMaterialPhase(board, [], 1, 6)).toBe('scarce');
    expect(discussionMaterialPhase(board, [], 1, 7)).toBe('developing');
    expect(discussionMaterialPhase(board, [], 1, 10)).toBe('decision');

    const once = foldDiscussionBoard(board, 'seat-1', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-4', basis: 'speech_content' }, voteIntent: null, boardAnalysis: false,
    });
    expect(discussionMaterialPhase(once, [], 1, 5)).toBe('scarce');
    const twice = foldDiscussionBoard(once, 'seat-2', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-5', basis: 'reasoning_quality' }, voteIntent: null, boardAnalysis: false,
    });
    expect(discussionMaterialPhase(twice, [], 1, 5)).toBe('developing');
    expect(discussionMaterialPhase(board, [{
      seat: 'seat-3', name: '占い候補', claimedRole: 'seer', coDay: 1, coStage: 'opening',
      results: [{ day: 0, targetSeat: 'seat-4', verdict: '人狼ではない', announcedDay: 1 }],
    }], 1, 3)).toBe('developing');
  });

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
      echoSpeakers: 0, distinctBases: 2,
      claimedResults: [{ sourceSeat: 'seat-1', claimedRole: 'seer', verdict: '人狼' }],
    });
    const digest = discussionBoardDigest(board, players, claims).join('\n');
    expect(digest).toContain('候補別の公開材料');
    expect(digest).toContain('投票予定3人');
    expect(digest).toContain('役職結果');
    expect(discussionAgenda(board, players, 'seat-4', 10).join('\n')).toContain('人数を根拠にしない');
  });

  it('同一論点の反復と独立論点を区別し、不正な引用元だけを安全側へ落とす', () => {
    const players = setupPlayers('echo-ledger');
    let board = emptyDiscussionBoard();
    board = foldDiscussionBoard(board, 'seat-1', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-7', basis: 'statement_slip', echoSourceSeat: null },
      voteIntent: null, boardAnalysis: false,
    });

    const echoed = sanitizeEchoSourceSeat(board, [], 'seat-2', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-7', basis: 'statement_slip', echoSourceSeat: 'seat-1' },
      voteIntent: null, boardAnalysis: false,
    });
    board = foldDiscussionBoard(board, 'seat-2', echoed);
    board = foldDiscussionBoard(board, 'seat-3', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-7', basis: 'statement_slip', echoSourceSeat: 'seat-1' },
      voteIntent: null, boardAnalysis: false,
    });
    board = foldDiscussionBoard(board, 'seat-4', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-7', basis: 'reasoning_quality', echoSourceSeat: null },
      voteIntent: null, boardAnalysis: false,
    });

    expect(candidateEvidenceLedger(board)[0]).toMatchObject({
      targetSeat: 'seat-7', suspicionSpeakers: 4,
      suspicionBases: { statement_slip: 3, reasoning_quality: 1 },
      echoSpeakers: 2, distinctBases: 2,
    });
    expect(saturatedPointFor(board)).toEqual({ targetSeat: 'seat-7', basis: 'statement_slip', speakers: 3 });
    expect(discussionBoardDigest(board, players).join('\n')).toContain('論点2種:statement_slip=3・reasoning_quality=1、同調2人');
    expect(discussionAgenda(board, players, 'seat-5', 8).join('\n')).toContain('同じ指摘の反復より');

    const invalid = sanitizeEchoSourceSeat(board, [], 'seat-5', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-8', basis: 'interaction', echoSourceSeat: 'seat-1' },
      voteIntent: null, boardAnalysis: false,
    });
    expect(invalid.suspicion?.echoSourceSeat).toBeNull();
  });

  it('席別の最新候補・回答・弁明・候補更新を既存structureだけから示す', () => {
    const players = setupPlayers('public-commitments');
    let board = emptyDiscussionBoard();
    board = foldDiscussionBoard(board, 'seat-1', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-4', basis: 'speech_content' }, voteIntent: null, boardAnalysis: false,
    });
    board = foldDiscussionBoard(board, 'seat-1', {
      primaryAct: 'suspicion', questionTopic: null,
      suspicion: { targetSeat: 'seat-5', basis: 'reasoning_quality' }, voteIntent: 'seat-5', boardAnalysis: false,
    });
    board = foldDiscussionBoard(board, 'seat-2', {
      primaryAct: 'answer', questionTopic: 'gray_read', suspicion: null, voteIntent: null, boardAnalysis: false,
    });
    board = foldDiscussionBoard(board, 'seat-2', {
      primaryAct: 'defense', questionTopic: null, suspicion: null, voteIntent: null, boardAnalysis: false,
    });

    expect(publicCommitmentsFor(board)).toEqual([
      {
        seat: 'seat-1', suspicionTargetSeat: 'seat-5', suspicionBasis: 'reasoning_quality', voteIntentTargetSeat: 'seat-5',
        answeredTopics: [], defended: false, changedSuspicion: true,
      },
      {
        seat: 'seat-2', answeredTopics: ['gray_read'], defended: true, changedSuspicion: false,
      },
    ]);
    const digest = discussionBoardDigest(board, players).join('\n');
    expect(digest).toContain('今日すでに公開した立場');
    expect(digest).toContain('疑い根拠=reasoning_quality');
    expect(digest).toContain('回答済み=gray_read');
    expect(digest).toContain('弁明済み');
    expect(digest).toContain('候補更新済み');
  });
});
