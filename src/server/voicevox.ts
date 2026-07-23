import { AGENT_VOICES, voiceForSeat } from '@/domain/voices';
import type { SeatId, TtsProvider } from '@/domain/types';

const DEFAULT_VOICEVOX_URL = 'http://127.0.0.1:50021';
const DEFAULT_AIVISSPEECH_URL = 'http://127.0.0.1:10101';
export const TTS_SPEED_SCALE = 1.1;
export const TTS_MAX_CHUNK_LENGTH = 64;
const TTS_TEXT_LIMIT = 200;
const TTS_HARD_BOUNDARY = /[。！？!?…\n]/u;
const TTS_BOUNDARY_UNITS = /[^。！？!?…、\n]*(?:[。！？!?…]+|、+|\n+)[」』）】》〉♪\p{Extended_Pictographic}\uFE0F]*|[^。！？!?…、\n]+$/gu;

const globalTtsQueue = globalThis as typeof globalThis & {
  __werewolfTtsSynthesisTails?: Partial<Record<TtsProvider, Promise<void>>>;
};
globalTtsQueue.__werewolfTtsSynthesisTails ??= {};

function serializeTtsSynthesis<T>(provider: TtsProvider, synthesize: () => Promise<T>): Promise<T> {
  const tails = globalTtsQueue.__werewolfTtsSynthesisTails ??= {};
  const previous = tails[provider] ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(synthesize);
  tails[provider] = result.then(() => undefined, () => undefined);
  return result;
}

export interface VoicevoxStatus {
  available: boolean;
  version: string | null;
  provider?: TtsProvider;
  voices: typeof AGENT_VOICES;
}

export function ttsBaseUrl(provider: TtsProvider): string {
  return provider === 'aivisspeech'
    ? process.env.AIVISSPEECH_URL ?? DEFAULT_AIVISSPEECH_URL
    : process.env.VOICEVOX_URL ?? DEFAULT_VOICEVOX_URL;
}

export async function getTtsStatus(provider: TtsProvider): Promise<VoicevoxStatus> {
  try {
    const response = await fetch(`${ttsBaseUrl(provider)}/version`, { signal: AbortSignal.timeout(2_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`TTS_${response.status}`);
    return { available: true, version: await response.json() as string, provider, voices: AGENT_VOICES };
  } catch {
    return { available: false, version: null, provider, voices: AGENT_VOICES };
  }
}

export const getVoicevoxStatus = (): Promise<VoicevoxStatus> => getTtsStatus('voicevox');

export function splitTtsText(text: string, maxChunkLength = TTS_MAX_CHUNK_LENGTH): string[] {
  const normalized = Array.from(text.trim()).slice(0, TTS_TEXT_LIMIT).join('');
  if (!normalized) return [];
  if (!Number.isInteger(maxChunkLength) || maxChunkLength < 1) throw new Error('INVALID_TTS_CHUNK_LENGTH');

  const units = normalized.match(TTS_BOUNDARY_UNITS) ?? [normalized];
  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const unit of units) {
    const unitChars = Array.from(unit);
    if (unitChars.length > maxChunkLength) {
      flush();
      for (let offset = 0; offset < unitChars.length; offset += maxChunkLength) {
        chunks.push(unitChars.slice(offset, offset + maxChunkLength).join(''));
      }
      continue;
    }
    if (Array.from(current).length + unitChars.length > maxChunkLength) flush();
    current += unit;
    if (TTS_HARD_BOUNDARY.test(unit)) flush();
  }
  flush();
  return chunks;
}

interface ParsedWav {
  format: Uint8Array;
  data: Uint8Array;
}

function wavChunkId(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function parseWav(audio: ArrayBuffer): ParsedWav {
  const view = new DataView(audio);
  if (audio.byteLength < 12 || wavChunkId(view, 0) !== 'RIFF' || wavChunkId(view, 8) !== 'WAVE') {
    throw new Error('INVALID_WAV');
  }
  let format: Uint8Array | null = null;
  let data: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= audio.byteLength;) {
    const id = wavChunkId(view, offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end > audio.byteLength) throw new Error('INVALID_WAV');
    if (id === 'fmt ') format = new Uint8Array(audio.slice(start, end));
    if (id === 'data') data = new Uint8Array(audio.slice(start, end));
    offset = end + (size % 2);
  }
  if (!format || !data) throw new Error('INVALID_WAV');
  return { format, data };
}

function writeWavChunkId(view: DataView, offset: number, id: string): void {
  for (let index = 0; index < 4; index += 1) view.setUint8(offset + index, id.charCodeAt(index));
}

function mergeWavAudio(parts: ArrayBuffer[]): ArrayBuffer {
  if (parts.length === 1) return parts[0];
  const parsed = parts.map(parseWav);
  const format = parsed[0].format;
  if (!parsed.every((part) =>
    part.format.length === format.length && part.format.every((value, index) => value === format[index]))) {
    throw new Error('INCOMPATIBLE_WAV');
  }
  const dataLength = parsed.reduce((total, part) => total + part.data.length, 0);
  const formatPadding = format.length % 2;
  const dataPadding = dataLength % 2;
  const output = new ArrayBuffer(12 + 8 + format.length + formatPadding + 8 + dataLength + dataPadding);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  writeWavChunkId(view, 0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  writeWavChunkId(view, 8, 'WAVE');
  writeWavChunkId(view, 12, 'fmt ');
  view.setUint32(16, format.length, true);
  bytes.set(format, 20);
  const dataHeaderOffset = 20 + format.length + formatPadding;
  writeWavChunkId(view, dataHeaderOffset, 'data');
  view.setUint32(dataHeaderOffset + 4, dataLength, true);
  let dataOffset = dataHeaderOffset + 8;
  for (const part of parsed) {
    bytes.set(part.data, dataOffset);
    dataOffset += part.data.length;
  }
  return output;
}

export async function synthesizeTtsSpeech(
  provider: TtsProvider,
  seat: SeatId,
  text: string,
  overrideVoice?: (typeof AGENT_VOICES)[number],
): Promise<ArrayBuffer> {
  return serializeTtsSynthesis(provider, async () => {
    const voice = overrideVoice ?? voiceForSeat(seat);
    if (!voice) throw new Error('INVALID_SEAT');
    const chunks = splitTtsText(text);
    if (chunks.length === 0) throw new Error('EMPTY_TEXT');
    const baseUrl = ttsBaseUrl(provider);
    const audioParts: ArrayBuffer[] = [];
    for (const chunk of chunks) {
      const queryResponse = await fetch(`${baseUrl}/audio_query?text=${encodeURIComponent(chunk)}&speaker=${voice.speakerId}`, {
        method: 'POST', signal: AbortSignal.timeout(10_000), cache: 'no-store',
      });
      if (!queryResponse.ok) throw new Error(`VOICEVOX_QUERY_${queryResponse.status}`);
      const query = await queryResponse.json() as Record<string, unknown>;
      // テンポを揃えるため、VOICEVOX互換AudioQueryではEngineを問わず話速だけ1.1へ固定する。
      query.speedScale = TTS_SPEED_SCALE;
      if (provider === 'voicevox') {
        query.volumeScale = 0.92;
        query.prePhonemeLength = 0.08;
        query.postPhonemeLength = 0.12;
      }
      const synthesisResponse = await fetch(`${baseUrl}/synthesis?speaker=${voice.speakerId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query),
        signal: AbortSignal.timeout(30_000), cache: 'no-store',
      });
      if (!synthesisResponse.ok) throw new Error(`VOICEVOX_SYNTHESIS_${synthesisResponse.status}`);
      audioParts.push(await synthesisResponse.arrayBuffer());
    }
    return mergeWavAudio(audioParts);
  });
}

export const synthesizeAgentSpeech = (
  seat: SeatId,
  text: string,
  overrideVoice?: (typeof AGENT_VOICES)[number],
): Promise<ArrayBuffer> => synthesizeTtsSpeech('voicevox', seat, text, overrideVoice);
