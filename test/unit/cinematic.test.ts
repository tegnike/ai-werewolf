import { describe, expect, it } from 'vitest';
import { cinematicCueForEvent, cinematicCuesBetween } from '@/ui/cinematic';
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

  it('襲撃のあった夜明けを日数と犠牲者名で表示する', () => {
    expect(cinematicCueForEvent(event(20, 'dawn', { victim: 'seat-3' }))).toMatchObject({
      title: '2日目', subtitle: '宮下 さくらが襲撃の犠牲になりました', tone: 'attack', sound: 'attack',
    });
  });

  it('犠牲者なしの夜明けは通常の日替わり演出にする', () => {
    expect(cinematicCueForEvent(event(20, 'dawn', { victim: null }))).toMatchObject({
      title: '2日目', subtitle: '昨夜の犠牲者はいません', tone: 'day', sound: 'scene',
    });
  });

  it('投票開始、開票、処刑を別々のキューへ変換する', () => {
    const cues = [
      event(30, 'discussion_closed'),
      event(31, 'vote_reveal', { round: 1 }),
      event(32, 'execution', { seat: 'seat-7' }),
    ].map(cinematicCueForEvent);
    expect(cues.map((cue) => cue?.title)).toEqual(['投票開始', '開票', '真壁 陽太']);
    expect(cues.map((cue) => cue?.sound)).toEqual(['scene', 'vote', 'execution']);
  });

  it('決選投票と処刑なしを明示する', () => {
    expect(cinematicCueForEvent(event(31, 'vote_reveal', { round: 2 }))?.title).toBe('決選開票');
    expect(cinematicCueForEvent(event(32, 'execution', { seat: null }))).toMatchObject({ title: '処刑なし', sound: 'scene' });
  });

  it('指定seq間だけを順番どおり抽出して再接続時の重複を防ぐ', () => {
    const events = [event(20, 'dawn'), event(21, 'discussion_speech'), event(22, 'discussion_closed'), event(23, 'vote_reveal')];
    expect(cinematicCuesBetween(events, 20, 23).map((cue) => cue.seq)).toEqual([22, 23]);
  });
});
