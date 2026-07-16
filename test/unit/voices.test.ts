import { describe, expect, it } from 'vitest';
import { AGENT_VOICES, voiceForSeat } from '@/domain/voices';

describe('VOICEVOX話者割り当て', () => {
  it('9座席を9人の異なるキャラクターへ固定する', () => {
    expect(AGENT_VOICES).toHaveLength(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.seat)).size).toBe(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.speakerName)).size).toBe(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.speakerId)).size).toBe(9);
    expect(voiceForSeat('seat-1')?.speakerName).toBe('四国めたん');
    expect(voiceForSeat('seat-9')?.speakerName).toBe('冥鳴ひまり');
  });
});
