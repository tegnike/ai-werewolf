import { describe, expect, it, vi } from 'vitest';
import {
  fillSpeechPrefetch, isRetryableTtsFailure, POST_SPEECH_GAP_MS, prepareSpeechWithRetry, SerialSpeechPreparer,
  speechPlaybackFailureDisposition, TTS_PREFETCH_DEPTH, TTS_PREPARE_MAX_ATTEMPTS, TtsHttpError, type SpeechItem,
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

  it('一時的なTTS失敗は順序を保持したまま最大3回まで再試行する', async () => {
    const prepare = vi.fn()
      .mockRejectedValueOnce(new TtsHttpError(503))
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValue('audio');
    const wait = vi.fn(async () => undefined);

    await expect(prepareSpeechWithRetry(prepare, undefined, wait)).resolves.toBe('audio');

    expect(TTS_PREPARE_MAX_ATTEMPTS).toBe(3);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('入力不正など再試行不能なHTTPエラーは繰り返さない', async () => {
    const prepare = vi.fn().mockRejectedValue(new TtsHttpError(400));
    const wait = vi.fn(async () => undefined);

    await expect(prepareSpeechWithRetry(prepare, undefined, wait)).rejects.toMatchObject({ status: 400 });

    expect(isRetryableTtsFailure(new TtsHttpError(400))).toBe(false);
    expect(prepare).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it('キャンセルされた先行合成は再試行しない', async () => {
    const controller = new AbortController();
    controller.abort();
    const prepare = vi.fn(async () => 'audio');

    await expect(prepareSpeechWithRetry(prepare, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(prepare).not.toHaveBeenCalled();
  });
});
