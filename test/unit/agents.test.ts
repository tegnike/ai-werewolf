import { describe, expect, it } from 'vitest';
import { addressGuideForSeat, addressTermFor, AGENT_ADDRESS_BOOKS, AGENT_PERSONAS, personaForSeat } from '@/domain/agents';

describe('エージェント人格', () => {
  it('9席に重複しない人格を割り当てる', () => {
    expect(AGENT_PERSONAS).toHaveLength(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.seat)).size).toBe(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.name)).size).toBe(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.title)).size).toBe(9);
    expect(new Set(AGENT_PERSONAS.map((persona) => persona.exampleLine)).size).toBe(9);
    expect(AGENT_PERSONAS.every((persona) => persona.firstPerson === '私' || persona.firstPerson === '俺')).toBe(true);
    expect(personaForSeat('seat-6').name).toBe('黒田 剛');
    expect(personaForSeat('seat-6').title).toBe('愛想のない現実主義者');
    expect(personaForSeat('seat-6').firstPerson).toBe('俺');
    expect(personaForSeat('seat-8').contradiction).toContain('子ども扱い');
  });

  it('各人が他の8人を人格に沿った固有の呼称で呼ぶ', () => {
    for (const persona of AGENT_PERSONAS) {
      const addressBook = AGENT_ADDRESS_BOOKS[persona.seat];
      expect(Object.keys(addressBook)).toHaveLength(8);
      expect(addressBook[persona.seat]).toBeUndefined();
      expect(Object.values(addressBook).every((term) => term && !term.includes('Agent'))).toBe(true);
    }
    expect(addressTermFor('seat-1', 'seat-6')).toBe('剛さん');
    expect(addressTermFor('seat-4', 'seat-7')).toBe('真壁さん');
    expect(addressTermFor('seat-5', 'seat-8')).toBe('征司');
    expect(addressTermFor('seat-6', 'seat-3')).toBe('宮下');
    expect(addressTermFor('seat-8', 'seat-7')).toBe('真壁くん');
    expect(addressGuideForSeat('seat-2')).toContain('宮下 さくらは「さくらちゃん」');
  });
});
