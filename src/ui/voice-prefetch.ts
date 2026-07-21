export interface SpeechItem { seq: number; seat: string; speech: string }

export const TTS_PREFETCH_DEPTH = 2;
export const POST_SPEECH_GAP_MS = 1_000;

export function speechPlaybackFailureDisposition(paused: boolean): 'retry' | 'finish' {
  return paused ? 'retry' : 'finish';
}

export class SerialSpeechPreparer {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(prepare: () => Promise<T>): Promise<T> {
    const prepared = this.tail.then(prepare);
    this.tail = prepared.then(() => undefined, () => undefined);
    return prepared;
  }

  reset(): void {
    this.tail = Promise.resolve();
  }
}

export function fillSpeechPrefetch<T>(
  queue: readonly SpeechItem[],
  prepared: Map<number, Promise<T>>,
  prepare: (item: SpeechItem) => Promise<T>,
  depth = TTS_PREFETCH_DEPTH,
): void {
  for (const item of queue) {
    if (prepared.size >= depth) break;
    if (prepared.has(item.seq)) continue;
    prepared.set(item.seq, prepare(item));
  }
}
