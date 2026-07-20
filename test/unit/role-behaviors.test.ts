import { describe, expect, it } from 'vitest';
import { AGENT_PERSONAS } from '@/domain/agents';
import { AGENT_ROLE_BEHAVIORS, roleBehaviorFor } from '@/domain/role-behaviors';
import type { Role } from '@/domain/types';

const ROLES: Role[] = ['villager', 'werewolf', 'seer', 'medium', 'bodyguard', 'madman'];

describe('人格別の役職行動方針', () => {
  it('9人それぞれに6役職、合計54通りの固有方針がある', () => {
    const behaviors = AGENT_PERSONAS.flatMap(({ seat }) => ROLES.map((role) => roleBehaviorFor(seat, role)));

    expect(Object.keys(AGENT_ROLE_BEHAVIORS)).toHaveLength(9);
    expect(behaviors).toHaveLength(54);
    expect(behaviors.every((behavior) => behavior.length >= 40)).toBe(true);
    expect(new Set(behaviors).size).toBe(54);
    expect(behaviors.join('\n')).not.toMatch(/(?:^|[^A-Za-z])(?:CO|ＣＯ)(?=$|[^A-Za-z])/i);
  });

  it('全員の狂人方針で、人狼を知らないという情報境界を明示する', () => {
    for (const { seat } of AGENT_PERSONAS) {
      expect(roleBehaviorFor(seat, 'madman')).toContain('人狼の正体は知らない');
    }
  });

  it('全員の護衛方針で連続護衛禁止を守らせる', () => {
    for (const { seat } of AGENT_PERSONAS) {
      expect(roleBehaviorFor(seat, 'bodyguard')).toContain('連続護衛禁止');
    }
  });

  it('人格と行動方針が偏りを自分で打ち消さない', () => {
    const normalizers = [
      'しすぎないよう', '固執せず', '固執しない', '引きずらず', 'こだわらず',
      '決め打ちしない', '好き嫌いでは選ばず', '無条件には信じない', 'バランス',
      '公平に比較', '冷静に比較',
    ];
    const texts = [
      ...AGENT_PERSONAS.flatMap((persona) => [
        persona.coreDrive, persona.contradiction, persona.socialBias,
        persona.emotionalPattern, persona.decisionHabit,
      ]),
      ...AGENT_PERSONAS.flatMap(({ seat }) => ROLES.map((role) => roleBehaviorFor(seat, role))),
    ];
    for (const text of texts) {
      for (const phrase of normalizers) expect(text).not.toContain(phrase);
    }
  });
});
