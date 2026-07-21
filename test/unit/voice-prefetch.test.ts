import { describe, expect, it, vi } from 'vitest';
import {
  fillSpeechPrefetch, POST_SPEECH_GAP_MS, SerialSpeechPreparer, speechPlaybackFailureDisposition,
  TTS_PREFETCH_DEPTH, type SpeechItem,
} from '@/ui/voice-prefetch';

const speeches: SpeechItem[] = [
  { seq: 1, seat: 'seat-1', speech: '一人目' },
  { seq: 2, seat: 'seat-2', speech: '二人目' },
  { seq: 3, seat: 'seat-3', speech: '三人目' },
];

describe('音声合成の先読み', () => {
  it('発言終了後に1秒の間を置く', () => {
    expect(POST_SPEECH_GAP_MS).toBe(1_000);
  });

  it('演出pauseと再生開始が競合した発言は完了扱いにしない', () => {
    expect(speechPlaybackFailureDisposition(true)).toBe('retry');
    expect(speechPlaybackFailureDisposition(false)).toBe('finish');
  });

  it('発言順を保ったまま上限件数まで合成を開始する', () => {
    const prepared = new Map<number, Promise<string>>();
    const prepare = vi.fn(async (item: SpeechItem) => `audio-${item.seq}`);

    fillSpeechPrefetch(speeches, prepared, prepare);

    expect(TTS_PREFETCH_DEPTH).toBe(2);
    expect(prepare.mock.calls.map(([item]) => item.seq)).toEqual([1, 2]);
    expect([...prepared.keys()]).toEqual([1, 2]);
  });

  it('再呼び出しでは合成済みの発言を重複させない', () => {
    const prepared = new Map<number, Promise<string>>();
    const prepare = vi.fn(async (item: SpeechItem) => `audio-${item.seq}`);

    fillSpeechPrefetch(speeches, prepared, prepare);
    fillSpeechPrefetch(speeches, prepared, prepare);

    expect(prepare).toHaveBeenCalledTimes(2);
    expect([...prepared.keys()]).toEqual([1, 2]);
  });

  it('再生対象を取り除くと次の発言を先読みする', () => {
    const prepared = new Map<number, Promise<string>>();
    const prepare = vi.fn(async (item: SpeechItem) => `audio-${item.seq}`);

    fillSpeechPrefetch(speeches, prepared, prepare);
    prepared.delete(1);
    fillSpeechPrefetch(speeches.slice(1), prepared, prepare);

    expect(prepare.mock.calls.map(([item]) => item.seq)).toEqual([1, 2, 3]);
    expect([...prepared.keys()]).toEqual([2, 3]);
  });

  it('複数の先読みをTTS Engineへは1件ずつ送る', async () => {
    const serial = new SerialSpeechPreparer();
    let finishFirst: (() => void) | undefined;
    const first = serial.enqueue(() => new Promise<string>((resolve) => {
      finishFirst = () => resolve('first');
    }));
    const secondTask = vi.fn(async () => 'second');
    const second = serial.enqueue(secondTask);

    await Promise.resolve();
    expect(secondTask).not.toHaveBeenCalled();
    finishFirst?.();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(secondTask).toHaveBeenCalledOnce();
  });
});
