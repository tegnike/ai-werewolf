export interface SpeechItem { seq: number; seat: string; speech: string }

export const TTS_PREFETCH_DEPTH = 2;
export const POST_SPEECH_GAP_MS = 1_000;
export const TTS_PREPARE_MAX_ATTEMPTS = 3;
export const TTS_RETRY_DELAYS_MS = [300, 900] as const;

export class TtsHttpError extends Error {
  constructor(readonly status: number) {
    super(`TTS_HTTP_${status}`);
    this.name = 'TtsHttpError';
  }
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

export function isRetryableTtsFailure(cause: unknown): boolean {
  if (isAbortError(cause)) return false;
  if (cause instanceof TtsHttpError) return cause.status === 408 || cause.status === 429 || cause.status >= 500;
  return true;
}

const waitForRetry = (delayMs: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  const timer = setTimeout(resolve, delayMs);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

export async function prepareSpeechWithRetry<T>(
  prepare: () => Promise<T>,
  signal?: AbortSignal,
  wait: (delayMs: number, signal?: AbortSignal) => Promise<void> = waitForRetry,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < TTS_PREPARE_MAX_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return await prepare();
    } catch (cause) {
      lastError = cause;
      if (!isRetryableTtsFailure(cause) || attempt === TTS_PREPARE_MAX_ATTEMPTS - 1) throw cause;
      await wait(TTS_RETRY_DELAYS_MS[attempt], signal);
    }
  }
  throw lastError;
}

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
