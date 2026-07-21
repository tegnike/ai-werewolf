import { AGENT_VOICES, voiceForSeat } from '@/domain/voices';
import type { SeatId, TtsProvider } from '@/domain/types';

const DEFAULT_VOICEVOX_URL = 'http://127.0.0.1:50021';
const DEFAULT_AIVISSPEECH_URL = 'http://127.0.0.1:10101';
export const TTS_SPEED_SCALE = 1.1;

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

export async function synthesizeTtsSpeech(
  provider: TtsProvider,
  seat: SeatId,
  text: string,
  overrideVoice?: (typeof AGENT_VOICES)[number],
): Promise<ArrayBuffer> {
  const voice = overrideVoice ?? voiceForSeat(seat);
  if (!voice) throw new Error('INVALID_SEAT');
  const normalized = Array.from(text.trim()).slice(0, 200).join('');
  if (!normalized) throw new Error('EMPTY_TEXT');
  const baseUrl = ttsBaseUrl(provider);
  const queryResponse = await fetch(`${baseUrl}/audio_query?text=${encodeURIComponent(normalized)}&speaker=${voice.speakerId}`, {
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
  return synthesisResponse.arrayBuffer();
}

export const synthesizeAgentSpeech = (
  seat: SeatId,
  text: string,
  overrideVoice?: (typeof AGENT_VOICES)[number],
): Promise<ArrayBuffer> => synthesizeTtsSpeech('voicevox', seat, text, overrideVoice);
