import { describe, expect, it } from 'vitest';
import type { UiEvent } from '@/ui/types';
import { derivePresentedState, featuredSpeechEvent, focusPanelKind, presentationCursorAfterLoad, presentationLimit, privateActionDescription } from '@/ui/presentation';

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

  it('一時停止中は到着済みイベントがあっても表示位置を進めない', () => {
    expect(presentationLimit(events, 11, true, false, null, true)).toBe(11);
  });
});

describe('公開視点の非公開イベント表示', () => {
  it('固定ラベルを実施ログとして表示する', () => {
    expect(privateActionDescription({ ...event(1, 'private_action'), payload: { label: '人狼確認' } }))
      .toBe('人狼確認が行われました。');
  });
});

describe('注目発言の選択', () => {
  const firstSpeech = { ...event(11, 'discussion_speech'), payload: { seat: 'seat-1', speech: '最初の発言' } };
  const secondSpeech = { ...event(13, 'discussion_speech'), payload: { seat: 'seat-2', speech: '次の発言' } };
  const events = [firstSpeech, event(12, 'private_action'), secondSpeech];

  it('発声中はそのseqの発言を選ぶ', () => {
    expect(featuredSpeechEvent(events, 11)).toBe(firstSpeech);
  });

  it('発声中でない間は最新の発言を保持する', () => {
    expect(featuredSpeechEvent(events, null)).toBe(secondSpeech);
  });

  it('発言と投票があっても議論中は発言だけを表示する', () => {
    expect(focusPanelKind(secondSpeech, true, 1, 'discussion')).toBe('speech');
  });

  it('投票フェーズでは発言を隠して投票だけを表示する', () => {
    expect(focusPanelKind(secondSpeech, true, 1, 'vote')).toBe('vote');
  });
});

describe('公開イベントからの観戦フェーズ導出', () => {
  it('公開イベントがまだない進行中の試合は第0夜として表示する', () => {
    expect(derivePresentedState([], 'running')).toEqual({ day: 0, phase: 'night_zero' });
  });

  it('議論終了イベントを受け取ると発言数にかかわらず投票中として表示する', () => {
    const discussionClosed = { ...event(12, 'discussion_closed'), phase: 'vote' };
    expect(derivePresentedState([event(11, 'discussion_speech'), discussionClosed], 'running')).toEqual({ day: 1, phase: 'vote' });
  });

  it('旧形式の試合は生存者全員の2周目発言から投票中と判定する', () => {
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
