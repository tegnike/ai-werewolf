import { describe, expect, it } from 'vitest';
import {
  CINEMATIC_INTER_CUE_GAP_MS,
  CINEMATIC_LONG_DURATION_MS,
  CINEMATIC_SHORT_DURATION_MS,
  CINEMATIC_VOTE_PRE_DELAY_MS,
  CINEMATIC_VOTE_RESULT_DURATION_MS,
  cinematicCueForEvent,
  cinematicCuesBetween,
} from '@/ui/cinematic';
import type { UiEvent } from '@/ui/types';

const event = (seq: number, type: string, payload: Record<string, unknown> = {}, day = 2): UiEvent => ({
  matchId: 'test', seq, day, phase: 'dawn', type, payload, createdAt: '2026-07-17T00:00:00.000Z', visibility: 'public',
});

describe('見せ場の画面演出', () => {
  it('試合開始を第0夜として表示する', () => {
    expect(cinematicCueForEvent(event(1, 'match_created', {}, 0))).toMatchObject({
      title: '第0夜', subtitle: '配役確認と最初の夜の行動が始まります', sound: 'scene',
    });
  });

  it('公開視点の配役決定伏せ字イベントも第0夜として表示する', () => {
    expect(cinematicCueForEvent(event(1, 'private_action', { label: '配役決定' }, 0))?.title).toBe('第0夜');
  });

  it('初夜の占い完了時に1日目を表示し、最初の発言とは重ねない', () => {
    const events = [event(7, 'private_action', { label: '占い結果の確認' }, 0), event(8, 'discussion_speech', {}, 1)];
    expect(cinematicCuesBetween(events, 0, 8).map((cue) => ({ seq: cue.seq, title: cue.title }))).toEqual([{ seq: 7, title: '1日目' }]);
  });

  it('襲撃のあった夜明けは犠牲者名を先に大きく表示する', () => {
    expect(cinematicCueForEvent(event(20, 'dawn', { victim: 'seat-3' }))).toMatchObject({
      title: '宮下 さくら', subtitle: '襲撃の犠牲になりました', tone: 'attack', sound: 'attack',
    });
    const cues = cinematicCuesBetween([event(20, 'dawn', { victim: 'seat-3' })], 19, 20);
    expect(cues.map((cue) => cue.title)).toEqual(['宮下 さくら', '2日目']);
    expect(cues.map((cue) => cue.revealEventAfter)).toEqual([true, undefined]);
  });

  it('犠牲者なしも結果を先に表示してから日替わり演出にする', () => {
    expect(cinematicCueForEvent(event(20, 'dawn', { victim: null }))).toMatchObject({
      title: '犠牲者なし', subtitle: '昨夜は誰も襲撃されませんでした', tone: 'day', sound: 'scene',
    });
    expect(cinematicCuesBetween([event(20, 'dawn', { victim: null })], 19, 20)
      .map((cue) => cue.title)).toEqual(['犠牲者なし', '2日目']);
  });

  it('投票開始は演出せず、一拍置いて開票し、中央の投票結果を読んでから処刑を演出する', () => {
    const events = [
      event(30, 'discussion_closed'),
      event(31, 'vote_reveal', { round: 1, tally: { 'seat-7': 5, 'seat-3': 3, 'seat-1': 1 } }),
      event(32, 'execution', { seat: 'seat-7' }),
    ];
    const cues = cinematicCuesBetween(events, 29, 32);
    expect(cues.map((cue) => cue.title)).toEqual(['開票', '投票結果', '真壁 陽太']);
    expect(cues.map((cue) => cue.sound)).toEqual(['vote', 'scene', 'execution']);
    expect(cues.map((cue) => cue.durationMs)).toEqual([
      CINEMATIC_SHORT_DURATION_MS,
      CINEMATIC_VOTE_RESULT_DURATION_MS,
      CINEMATIC_LONG_DURATION_MS,
    ]);
    expect(cues[0].gapBeforeMs).toBe(CINEMATIC_VOTE_PRE_DELAY_MS);
    expect(cues[1].voteResults).toEqual([
      { seat: 'seat-7', name: '真壁 陽太', count: 5, leading: true },
      { seat: 'seat-3', name: '宮下 さくら', count: 3, leading: false },
      { seat: 'seat-1', name: '名取 澪', count: 1, leading: false },
    ]);
    expect(cues[1].revealEventAfter).toBe(true);
    expect(cues[2].revealEventAfter).toBe(true);
  });

  it('カットインを長く保ち、連続時にも切替間隔を設ける', () => {
    expect(CINEMATIC_SHORT_DURATION_MS).toBe(2400);
    expect(CINEMATIC_LONG_DURATION_MS).toBe(3600);
    expect(CINEMATIC_INTER_CUE_GAP_MS).toBe(600);
    expect(CINEMATIC_VOTE_PRE_DELAY_MS).toBe(1200);
    expect(CINEMATIC_VOTE_RESULT_DURATION_MS).toBe(5000);
  });

  it('決選投票と処刑なしを明示する', () => {
    expect(cinematicCueForEvent(event(31, 'vote_reveal', { round: 2 }))?.title).toBe('決選開票');
    expect(cinematicCueForEvent(event(32, 'execution', { seat: null }))).toMatchObject({ title: '処刑なし', sound: 'scene' });
  });

  it('指定seq間だけを順番どおり抽出して再接続時の重複を防ぐ', () => {
    const events = [event(20, 'dawn'), event(21, 'discussion_speech'), event(22, 'discussion_closed'), event(23, 'vote_reveal')];
    expect(cinematicCuesBetween(events, 20, 23).map((cue) => ({ seq: cue.seq, title: cue.title }))).toEqual([
      { seq: 23, title: '開票' },
      { seq: 23, title: '投票結果' },
    ]);
  });
});
