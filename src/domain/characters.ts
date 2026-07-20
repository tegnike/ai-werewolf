import { z } from 'zod';
import { AGENT_ADDRESS_BOOKS, AGENT_PERSONAS, roleClaimSentenceForSeat, type AgentPersona } from './agents';
import { AGENT_ROLE_BEHAVIORS, type RoleBehaviorBook } from './role-behaviors';
import { AGENT_VOICES, type AgentVoice } from './voices';
import { SEATS } from './constants';
import type { Role, SeatId } from './types';

export interface CharacterProfile extends Omit<AgentPersona, 'firstPerson'> {
  firstPerson: string;
  roleClaimTemplate: string;
  addressBook: Partial<Record<SeatId, string>>;
  roleBehaviors: RoleBehaviorBook;
  voice: AgentVoice;
  portraitSrc: string;
}

export type CharacterRoster = CharacterProfile[];

const roleBehaviorSchema = z.object({
  villager: z.string().trim().min(1).max(1_200),
  werewolf: z.string().trim().min(1).max(1_200),
  seer: z.string().trim().min(1).max(1_200),
  medium: z.string().trim().min(1).max(1_200),
  bodyguard: z.string().trim().min(1).max(1_200),
  madman: z.string().trim().min(1).max(1_200),
});

const shortText = z.string().trim().min(1).max(120);
const description = z.string().trim().min(1).max(2_000);

export const characterProfileSchema = z.object({
  seat: z.custom<SeatId>((value) => typeof value === 'string' && SEATS.includes(value as SeatId), '座席が不正です。'),
  name: z.string().trim().min(1).max(40),
  firstPerson: z.string().trim().min(1).max(16),
  title: shortText,
  coreDrive: description,
  contradiction: description,
  socialBias: description,
  emotionalPattern: description,
  speechStyle: description,
  exampleLine: z.string().trim().min(1).max(500),
  lengthGuide: z.string().trim().min(1).max(300),
  performanceAnchor: description,
  decisionHabit: description,
  antiStyle: description,
  visualBrief: z.string().trim().min(1).max(1_000),
  roleClaimTemplate: z.string().trim().min(1).max(120).refine((value) => value.includes('{role}'), '役職名の差し込み位置 {role} が必要です。'),
  addressBook: z.record(z.string(), z.string().trim().min(1).max(60)),
  roleBehaviors: roleBehaviorSchema,
  voice: z.object({
    seat: z.custom<SeatId>((value) => typeof value === 'string' && SEATS.includes(value as SeatId)),
    speakerId: z.number().int().min(0).max(100_000),
    speakerName: z.string().trim().min(1).max(80),
    styleName: z.string().trim().min(1).max(80),
    presentation: z.enum(['female', 'male', 'androgynous']),
  }),
  portraitSrc: z.string().min(1).max(3_000_000).refine(
    (value) => value.startsWith('/assets/') || /^data:image\/(?:png|jpeg|webp);base64,/.test(value),
    '立ち絵はアプリ内アセットまたはPNG・JPEG・WebP画像を指定してください。',
  ),
}).superRefine((profile, context) => {
  if (profile.voice.seat !== profile.seat) {
    context.addIssue({ code: 'custom', path: ['voice', 'seat'], message: '音声の座席が一致していません。' });
  }
  for (const seat of SEATS) {
    if (seat === profile.seat) continue;
    if (!profile.addressBook[seat]?.trim()) {
      context.addIssue({ code: 'custom', path: ['addressBook', seat], message: `${seat}への呼び方が必要です。` });
    }
  }
});

const roleClaimTemplate = (seat: SeatId): string =>
  roleClaimSentenceForSeat(seat, '{role}' as '占い師' | '霊媒師');

export const DEFAULT_CHARACTER_ROSTER: CharacterRoster = AGENT_PERSONAS.map((persona, index) => ({
  ...persona,
  roleClaimTemplate: roleClaimTemplate(persona.seat),
  addressBook: { ...AGENT_ADDRESS_BOOKS[persona.seat] },
  roleBehaviors: { ...AGENT_ROLE_BEHAVIORS[persona.seat] },
  voice: { ...AGENT_VOICES[index] },
  portraitSrc: `/assets/agents/agent_${index + 1}.png`,
}));

export function cloneDefaultCharacterRoster(): CharacterRoster {
  return structuredClone(DEFAULT_CHARACTER_ROSTER);
}

export function characterForSeat(characters: CharacterRoster | undefined, seat: SeatId): CharacterProfile {
  const profile = characters?.find((item) => item.seat === seat) ?? DEFAULT_CHARACTER_ROSTER.find((item) => item.seat === seat);
  if (!profile) throw new Error(`Unknown character seat: ${seat}`);
  return profile;
}

export function characterNameForSeat(characters: CharacterRoster | undefined, seat: SeatId): string {
  return characterForSeat(characters, seat).name;
}

export function characterAddressTerm(
  characters: CharacterRoster | undefined,
  speaker: SeatId,
  target: SeatId,
): string {
  if (speaker === target) return characterNameForSeat(characters, speaker);
  const term = characterForSeat(characters, speaker).addressBook[target];
  if (!term) throw new Error(`Unknown address term: ${speaker} -> ${target}`);
  return term;
}

export function characterAddressGuide(characters: CharacterRoster | undefined, speaker: SeatId): string {
  return SEATS.filter((seat) => seat !== speaker)
    .map((target) => `${characterNameForSeat(characters, target)}は「${characterAddressTerm(characters, speaker, target)}」`)
    .join('、');
}

export function characterRoleClaimSentence(
  characters: CharacterRoster | undefined,
  seat: SeatId,
  roleLabel: '占い師' | '霊媒師',
): string {
  return characterForSeat(characters, seat).roleClaimTemplate.replaceAll('{role}', roleLabel);
}

export function characterRoleBehavior(characters: CharacterRoster | undefined, seat: SeatId, role: Role): string {
  return characterForSeat(characters, seat).roleBehaviors[role];
}

export function publicCharacterRoster(characters: CharacterRoster): Array<Pick<CharacterProfile, 'seat' | 'name' | 'title' | 'portraitSrc' | 'voice'>> {
  return characters.map(({ seat, name, title, portraitSrc, voice }) => ({ seat, name, title, portraitSrc, voice }));
}
