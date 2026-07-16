import { AGENT_VOICES, voiceForSeat } from '@/domain/voices';
import type { SeatId } from '@/domain/types';

const VOICEVOX_URL = process.env.VOICEVOX_URL ?? 'http://127.0.0.1:50021';
export const VOICEVOX_SPEED_SCALE = 1.1;

export interface VoicevoxStatus {
  available: boolean;
  version: string | null;
  voices: typeof AGENT_VOICES;
}

export async function getVoicevoxStatus(): Promise<VoicevoxStatus> {
  try {
    const response = await fetch(`${VOICEVOX_URL}/version`, { signal: AbortSignal.timeout(2_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`VOICEVOX ${response.status}`);
    return { available: true, version: await response.json() as string, voices: AGENT_VOICES };
  } catch {
    return { available: false, version: null, voices: AGENT_VOICES };
  }
}

export async function synthesizeAgentSpeech(seat: SeatId, text: string): Promise<ArrayBuffer> {
  const voice = voiceForSeat(seat);
  if (!voice) throw new Error('INVALID_SEAT');
  const normalized = Array.from(text.trim()).slice(0, 200).join('');
  if (!normalized) throw new Error('EMPTY_TEXT');
  const queryResponse = await fetch(`${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(normalized)}&speaker=${voice.speakerId}`, {
    method: 'POST', signal: AbortSignal.timeout(10_000), cache: 'no-store',
  });
  if (!queryResponse.ok) throw new Error(`VOICEVOX_QUERY_${queryResponse.status}`);
  const query = await queryResponse.json() as Record<string, unknown>;
  query.speedScale = VOICEVOX_SPEED_SCALE;
  query.volumeScale = 0.92;
  query.prePhonemeLength = 0.08;
  query.postPhonemeLength = 0.12;
  const synthesisResponse = await fetch(`${VOICEVOX_URL}/synthesis?speaker=${voice.speakerId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query),
    signal: AbortSignal.timeout(30_000), cache: 'no-store',
  });
  if (!synthesisResponse.ok) throw new Error(`VOICEVOX_SYNTHESIS_${synthesisResponse.status}`);
  return synthesisResponse.arrayBuffer();
}
