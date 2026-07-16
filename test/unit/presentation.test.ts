import { describe, expect, it } from 'vitest';
import type { UiEvent } from '@/ui/types';
import { presentationLimit } from '@/ui/presentation';

const event = (seq: number, type: string): UiEvent => ({ matchId: 'test', seq, type, day: 1, phase: 'discussion', visibility: 'public', payload: {}, createdAt: '2026-07-16T00:00:00.000Z' });

describe('音声とログの同期', () => {
  const events = [event(10, 'dawn'), event(11, 'discussion_speech'), event(12, 'decision_note'), event(13, 'discussion_speech')];

  it('次の発話イベント直前で表示を止める', () => {
    expect(presentationLimit(events, 9, true, false)).toBe(10);
    expect(presentationLimit(events, 11, true, true)).toBe(12);
  });

  it('読み上げ無効時は最新まで表示する', () => {
    expect(presentationLimit(events, 9, false, false)).toBe(13);
  });
});
