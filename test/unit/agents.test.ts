import { describe, expect, it } from 'vitest';
import { AGENT_PERSONAS, personaForSeat } from '@/domain/agents';

describe('エージェント人格', () => {
  it('9席に重複しない人格を割り当てる', () => {
    expect(AGENT_PERSONAS).toHaveLength(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.seat)).size).toBe(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.name)).size).toBe(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.title)).size).toBe(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.exampleLine)).size).toBe(9);
    expect(personaForSeat('seat-6').name).toBe('黒田 剛');
    expect(personaForSeat('seat-6').title).toBe('愛想のない現実主義者');
    expect(personaForSeat('seat-8').contradiction).toContain('子ども扱い');
  });
});
