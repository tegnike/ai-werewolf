import { describe, expect, it } from 'vitest';
import { buildEpilogue, fateLabel, teamForRole, type SpectatorDeathRecord } from '@/ui/epilogue';

describe('ミニエピローグ', () => {
  it('狂人を人狼陣営の勝者として扱う', () => {
    const deaths = new Map<string, SpectatorDeathRecord>([['seat-2', { cause: 'execution', day: 2 }]]);
    const result = buildEpilogue([
      { seat: 'seat-1', name: '村人', role: 'villager', alive: true },
      { seat: 'seat-2', name: '狂人', role: 'madman', alive: false },
    ], 'werewolf', deaths);
    expect(result).toEqual([
      expect.objectContaining({ team: 'village', fate: '生存', result: '敗北' }),
      expect.objectContaining({ team: 'werewolf', fate: '2日目に処刑', result: '勝利' }),
    ]);
  });

  it('生存・処刑・襲撃の運命を表示する', () => {
    expect(fateLabel()).toBe('生存');
    expect(fateLabel({ cause: 'execution', day: 3 })).toBe('3日目に処刑');
    expect(fateLabel({ cause: 'attack', day: 4 })).toBe('4日目朝に襲撃');
  });

  it('役職を一般ルールの陣営へ分類する', () => {
    expect(teamForRole('seer')).toBe('village');
    expect(teamForRole('werewolf')).toBe('werewolf');
    expect(teamForRole('madman')).toBe('werewolf');
  });
});
