import { describe, expect, it } from 'vitest';
import type { UiEvent } from '@/ui/types';
import { derivePresentedState, presentationCursorAfterLoad, presentationLimit } from '@/ui/presentation';

const event = (seq: number, type: string): UiEvent => ({ matchId: 'test', seq, type, day: 1, phase: 'discussion', visibility: 'public', payload: {}, createdAt: '2026-07-16T00:00:00.000Z' });

describe('音声とログの同期', () => {
  const events = [event(10, 'dawn'), event(11, 'discussion_speech'), event(12, 'decision_note'), event(13, 'discussion_speech')];

  it('次の発話イベント直前で表示を止める', () => {
    expect(presentationLimit(events, 9, true, false, null)).toBe(10);
    expect(presentationLimit(events, 11, true, true, null)).toBe(12);
  });

  it('発話中は後続の投票ログや次の発話が到着しても表示を進めない', () => {
    const withVoteAndWolfSpeech = [
      event(11, 'discussion_speech'),
      { ...event(12, 'vote_reveal'), phase: 'vote' },
      { ...event(13, 'execution'), phase: 'execution' },
      { ...event(14, 'werewolf_chat'), phase: 'wolf_chat' },
    ];
    expect(presentationLimit(withVoteAndWolfSpeech, 11, true, true, 11)).toBe(11);
    expect(presentationLimit(withVoteAndWolfSpeech, 11, true, true, null)).toBe(13);
  });

  it('読み上げ無効時は最新まで表示する', () => {
    expect(presentationLimit(events, 9, false, false, null)).toBe(13);
  });

  it('視点を切り替えて再読込しても表示位置を進めない', () => {
    expect(presentationCursorAfterLoad(11, 13, true)).toBe(11);
    expect(presentationCursorAfterLoad(0, 13, false)).toBe(13);
  });
});

describe('公開イベントからの観戦フェーズ導出', () => {
  it('公開イベントがまだない進行中の試合は第0夜として表示する', () => {
    expect(derivePresentedState([], 'running')).toEqual({ day: 0, phase: 'night_zero' });
  });

  it('生存者全員の2周目発言が終わると投票中として表示する', () => {
    const speeches = Array.from({ length: 18 }, (_, index) => ({
      ...event(index + 1, 'discussion_speech'), payload: { seat: `seat-${(index % 9) + 1}`, speech: '発言' },
    }));
    expect(derivePresentedState(speeches, 'running')).toEqual({ day: 1, phase: 'vote' });
  });

  it('処刑後に非公開の夜処理が進む間も夜として表示する', () => {
    const execution = { ...event(20, 'execution'), phase: 'execution', payload: { seat: 'seat-4' } };
    expect(derivePresentedState([execution], 'running')).toEqual({ day: 1, phase: 'night_actions' });
  });
});
