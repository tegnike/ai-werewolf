import type { Role, Team } from '@/domain/types';
import { ROLE_LABEL } from '@/domain/constants';

export interface SpectatorDeathRecord {
  cause: 'execution' | 'attack';
  day: number;
}

export interface EpiloguePlayer {
  seat: string;
  name: string;
  role: Role;
  team: Team;
  fate: string;
  result: '勝利' | '敗北' | '引き分け';
}

const roles = new Set<Role>(['villager', 'werewolf', 'seer', 'medium', 'bodyguard', 'madman']);

export function teamForRole(role: Role): Team {
  return role === 'werewolf' || role === 'madman' ? 'werewolf' : 'village';
}

export function fateLabel(record?: SpectatorDeathRecord): string {
  if (!record) return '生存';
  return record.cause === 'execution' ? `${record.day}日目に処刑` : `${record.day}日目朝に襲撃`;
}

export function buildEpilogue(
  value: unknown,
  winner: unknown,
  deathRecords: ReadonlyMap<string, SpectatorDeathRecord>,
): EpiloguePlayer[] {
  if (!Array.isArray(value) || !['village', 'werewolf', 'draw'].includes(String(winner))) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const player = item as Record<string, unknown>;
    if (typeof player.seat !== 'string' || typeof player.name !== 'string' || !roles.has(player.role as Role)) return [];
    const role = player.role as Role;
    const team = teamForRole(role);
    const result = winner === 'draw' ? '引き分け' : team === winner ? '勝利' : '敗北';
    return [{ seat: player.seat, name: player.name, role, team, fate: fateLabel(deathRecords.get(player.seat)), result }];
  });
}

export function epilogueRoleLabel(role: Role): string {
  return ROLE_LABEL[role];
}
