import { describe, expect, it } from 'vitest';
import { AGENT_PERSONAS, personaForSeat } from '@/domain/agents';

describe('エージェント人格', () => {
  it('9席に重複しない人格を割り当てる', () => {
    expect(AGENT_PERSONAS).toHaveLength(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.seat)).size).toBe(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.title)).size).toBe(9);
    expect(personaForSeat('seat-6').title).toBe('寡黙な懐疑派');
    expect(personaForSeat('seat-8').lengthGuide).toContain('145〜195文字');
  });
});
