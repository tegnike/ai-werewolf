export interface SpeechItem { seq: number; seat: string; speech: string }

export const TTS_PREFETCH_DEPTH = 2;

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
