import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_VOICES, voiceForSeat } from '@/domain/voices';
import { synthesizeAgentSpeech, VOICEVOX_SPEED_SCALE } from '@/server/voicevox';

afterEach(() => vi.unstubAllGlobals());

describe('VOICEVOX話者割り当て', () => {
  it('9座席を9人の異なるキャラクターへ固定する', () => {
    expect(AGENT_VOICES).toHaveLength(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.seat)).size).toBe(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.speakerName)).size).toBe(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.speakerId)).size).toBe(9);
    expect(voiceForSeat('seat-1')?.speakerName).toBe('四国めたん');
    expect(voiceForSeat('seat-9')?.speakerName).toBe('冥鳴ひまり');
  });

  it('全話者の合成クエリへ1.1倍の話速を適用する', async () => {
    let synthesisBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.body) {
        synthesisBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      return Response.json({ speedScale: 1, volumeScale: 1, prePhonemeLength: 0.1, postPhonemeLength: 0.1 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await synthesizeAgentSpeech('seat-1', '話速の確認です。');

    expect(VOICEVOX_SPEED_SCALE).toBe(1.1);
    expect(synthesisBody).toMatchObject({ speedScale: 1.1 });
  });
});
