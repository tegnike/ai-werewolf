import { z } from 'zod';
import { AGENT_ADDRESS_BOOKS, AGENT_PERSONAS, roleClaimSentenceForSeat, type AgentPersona } from './agents';
import {
  AGENT_CLAIM_STRATEGIES, CLAIM_PRESSURE_RESPONSES, CLAIM_TIMINGS, DECEPTIVE_CLAIM_ROLES, GENERIC_CLAIM_STRATEGY,
  type CharacterClaimStrategy,
} from './claim-strategies';
import { AGENT_ROLE_BEHAVIORS, type RoleBehaviorBook } from './role-behaviors';
import { AGENT_VOICES, type AgentVoice } from './voices';
import { SEATS } from './constants';
import { OPENAI_REASONING_EFFORTS } from './types';
import type { GeminiThinkingBudget, LlmProvider, OpenAiReasoningEffort, Role, SeatId, TtsProvider } from './types';

export type CharacterLlmSettings =
  | { provider: 'openai'; reasoningEffort: OpenAiReasoningEffort }
  | { provider: 'gemini'; thinkingBudget: GeminiThinkingBudget };

export type CharacterTtsSettings =
  | { provider: 'voicevox'; voice: AgentVoice }
  | { provider: 'aivisspeech'; voice: AgentVoice };

export const CHARACTER_ADDRESS_STYLES = [
  'full_name_san', 'family_name_san', 'given_name_san',
  'full_name', 'family_name', 'given_name', 'given_name_chan', 'given_name_kun',
] as const;
export type CharacterAddressStyle = (typeof CHARACTER_ADDRESS_STYLES)[number];

export interface CharacterProfile extends Omit<AgentPersona, 'firstPerson'> {
  firstPerson: string;
  roleClaimTemplate: string;
  /** 個別呼称がない相手への大まかな呼び方。 */
  defaultAddressStyle: CharacterAddressStyle;
  addressBook: Partial<Record<SeatId, string>>;
  roleBehaviors: RoleBehaviorBook;
  /** 役職を名乗るか、騙るか、待つかをLLMが人格として判断するための傾向。 */
  claimStrategy: CharacterClaimStrategy;
  /** 選択したLLMと、そのLLMだけに有効な推論設定。 */
  llm: CharacterLlmSettings;
  /** 選択した音声Engineと、そのEngineだけに有効な話者設定。 */
  tts: CharacterTtsSettings;
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
}).strict();

const trueRoleClaimStrategySchema = z.object({
  revealTendency: z.number().int().min(0).max(100),
  emptyResultRevealTendency: z.number().int().min(0).max(100),
  spotlightTolerance: z.number().int().min(0).max(100),
  timing: z.enum(CLAIM_TIMINGS),
  guidance: z.string().trim().min(1).max(2_000),
}).strict();

const deceptiveRoleClaimStrategySchema = z.object({
  claimTendency: z.number().int().min(0).max(100),
  counterclaimTendency: z.number().int().min(0).max(100),
  crowdingTolerance: z.number().int().min(0).max(100),
  spotlightTolerance: z.number().int().min(0).max(100),
  selfPreservationTendency: z.number().int().min(0).max(100),
  pressureResponse: z.enum(CLAIM_PRESSURE_RESPONSES),
  preferredRole: z.enum(DECEPTIVE_CLAIM_ROLES),
  timing: z.enum(CLAIM_TIMINGS),
  guidance: z.string().trim().min(1).max(2_000),
}).strict();

const claimStrategySchema = z.object({
  trueSeer: trueRoleClaimStrategySchema,
  trueMedium: trueRoleClaimStrategySchema,
  madman: deceptiveRoleClaimStrategySchema,
  werewolf: deceptiveRoleClaimStrategySchema.extend({
    teamExposureConcern: z.number().int().min(0).max(100),
  }).strict(),
  consistency: z.string().trim().min(1).max(2_000),
}).strict();

const shortText = z.string().trim().min(1).max(120);
const description = z.string().trim().min(1).max(2_000);

const voiceSchema = z.object({
  seat: z.custom<SeatId>((value) => typeof value === 'string' && SEATS.includes(value as SeatId)),
  speakerId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  speakerName: z.string().trim().min(1).max(80),
  styleName: z.string().trim().min(1).max(80),
  presentation: z.enum(['female', 'male', 'androgynous']),
}).strict();

const llmSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('openai'),
    reasoningEffort: z.enum(OPENAI_REASONING_EFFORTS),
  }).strict(),
  z.object({
    provider: z.literal('gemini'),
    thinkingBudget: z.number().int().refine(
      (value) => value === -1 || (value >= 128 && value <= 32_768),
      'Geminiの思考トークン予算は-1または128〜32768で指定してください。',
    ),
  }).strict(),
]);

const ttsSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('voicevox'), voice: voiceSchema }).strict(),
  z.object({ provider: z.literal('aivisspeech'), voice: voiceSchema }).strict(),
]);

export const strictCharacterProfileSchema = z.object({
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
  defaultAddressStyle: z.enum(CHARACTER_ADDRESS_STYLES),
  addressBook: z.record(z.string(), z.string().trim().min(1).max(60)),
  roleBehaviors: roleBehaviorSchema,
  claimStrategy: claimStrategySchema,
  llm: llmSchema,
  tts: ttsSchema,
  portraitSrc: z.string().min(1).max(3_000_000).refine(
    (value) => value.startsWith('/assets/') || /^data:image\/(?:png|jpeg|webp);base64,/.test(value),
    '立ち絵はアプリ内アセットまたはPNG・JPEG・WebP画像を指定してください。',
  ),
}).strict().superRefine((profile, context) => {
  if (profile.tts.voice.seat !== profile.seat) {
    context.addIssue({ code: 'custom', path: ['tts', 'voice', 'seat'], message: '音声の座席が一致していません。' });
  }
  for (const seat of Object.keys(profile.addressBook)) {
    if (!SEATS.includes(seat as SeatId)) {
      context.addIssue({ code: 'custom', path: ['addressBook', seat], message: '存在しない座席への呼称です。' });
    } else if (seat === profile.seat) {
      context.addIssue({ code: 'custom', path: ['addressBook', seat], message: '自分自身への呼称は指定しません。' });
    }
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 旧DB・旧試合スナップショットだけを新しい排他的構造へ読み替える。 */
function normalizeLegacyCharacterProfile(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized = { ...value };

  if (!('defaultAddressStyle' in normalized)) {
    normalized.defaultAddressStyle = 'full_name';
  }

  const defaultPersona = AGENT_PERSONAS.find((persona) => persona.name === normalized.name);
  const claimDefaults = structuredClone(
    defaultPersona ? AGENT_CLAIM_STRATEGIES[defaultPersona.seat] : GENERIC_CLAIM_STRATEGY,
  );
  const storedClaimStrategy = isRecord(normalized.claimStrategy) ? normalized.claimStrategy : {};
  normalized.claimStrategy = {
    trueSeer: { ...claimDefaults.trueSeer, ...(isRecord(storedClaimStrategy.trueSeer) ? storedClaimStrategy.trueSeer : {}) },
    trueMedium: { ...claimDefaults.trueMedium, ...(isRecord(storedClaimStrategy.trueMedium) ? storedClaimStrategy.trueMedium : {}) },
    madman: { ...claimDefaults.madman, ...(isRecord(storedClaimStrategy.madman) ? storedClaimStrategy.madman : {}) },
    werewolf: { ...claimDefaults.werewolf, ...(isRecord(storedClaimStrategy.werewolf) ? storedClaimStrategy.werewolf : {}) },
    consistency: typeof storedClaimStrategy.consistency === 'string'
      ? storedClaimStrategy.consistency
      : claimDefaults.consistency,
  };

  if (!('llm' in normalized)) {
    const provider: LlmProvider = normalized.llmProvider === 'gemini' ? 'gemini' : 'openai';
    normalized.llm = provider === 'gemini'
      ? { provider, thinkingBudget: normalized.geminiThinkingBudget ?? -1 }
      : { provider, reasoningEffort: normalized.openaiReasoningEffort ?? 'low' };
    delete normalized.llmProvider;
    delete normalized.openaiReasoningEffort;
    delete normalized.geminiThinkingBudget;
  }

  if (!('tts' in normalized)) {
    const provider: TtsProvider = normalized.ttsProvider === 'aivisspeech' ? 'aivisspeech' : 'voicevox';
    normalized.tts = {
      provider,
      voice: provider === 'aivisspeech'
        ? normalized.aivisSpeechVoice ?? normalized.voice
        : normalized.voice,
    };
    delete normalized.ttsProvider;
    delete normalized.voice;
    delete normalized.aivisSpeechVoice;
  }

  return normalized;
}

export const characterProfileSchema = z.preprocess(normalizeLegacyCharacterProfile, strictCharacterProfileSchema);

const roleClaimTemplate = (seat: SeatId): string =>
  roleClaimSentenceForSeat(seat, '{role}' as '占い師' | '霊媒師');

export const DEFAULT_CHARACTER_ROSTER: CharacterRoster = AGENT_PERSONAS.map((persona, index) => ({
  ...persona,
  roleClaimTemplate: roleClaimTemplate(persona.seat),
  defaultAddressStyle: 'full_name',
  addressBook: { ...AGENT_ADDRESS_BOOKS[persona.seat] },
  roleBehaviors: { ...AGENT_ROLE_BEHAVIORS[persona.seat] },
  claimStrategy: structuredClone(AGENT_CLAIM_STRATEGIES[persona.seat]),
  llm: { provider: 'openai', reasoningEffort: 'low' },
  tts: { provider: 'voicevox', voice: { ...AGENT_VOICES[index] } },
  portraitSrc: `/assets/agents/agent_${index + 1}.png`,
}));

export function cloneDefaultCharacterRoster(): CharacterRoster {
  return structuredClone(DEFAULT_CHARACTER_ROSTER);
}

/**
 * 保存枠の既定キャラクターが別人格へ置き換わったとき、他の既定キャラクターが
 * 旧相手へ使っていた呼称だけを捨てる。後から明示設定した新しい呼称は保持する。
 */
export function withoutReplacedCharacterDefaultAddresses(characters: CharacterRoster): CharacterRoster {
  const defaultBySeat = new Map(DEFAULT_CHARACTER_ROSTER.map((character) => [character.seat, character]));
  const replacedSeats = characters.filter((character) => defaultBySeat.get(character.seat)?.name !== character.name);
  if (replacedSeats.length === 0) return characters;

  return characters.map((character) => {
    const defaultCharacter = defaultBySeat.get(character.seat);
    if (!defaultCharacter) return character;
    const addressBook = { ...character.addressBook };
    let changed = false;
    for (const target of replacedSeats) {
      const inheritedDefaultTerm = defaultCharacter.addressBook[target.seat];
      if (inheritedDefaultTerm !== undefined && addressBook[target.seat] === inheritedDefaultTerm) {
        delete addressBook[target.seat];
        changed = true;
      }
    }
    return changed ? { ...character, addressBook } : character;
  });
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
  const character = characterForSeat(characters, speaker);
  const term = character.addressBook[target];
  return term ?? addressTermForStyle(characterNameForSeat(characters, target), character.defaultAddressStyle);
}

export function addressTermForStyle(name: string, style: CharacterAddressStyle): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const familyName = parts[0] ?? name;
  const givenName = parts.length > 1 ? parts.slice(1).join(' ') : familyName;
  switch (style) {
    case 'full_name_san': return `${name}さん`;
    case 'family_name_san': return `${familyName}さん`;
    case 'given_name_san': return `${givenName}さん`;
    case 'family_name': return familyName;
    case 'given_name': return givenName;
    case 'given_name_chan': return `${givenName}ちゃん`;
    case 'given_name_kun': return `${givenName}くん`;
    default: return name;
  }
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

export function characterClaimStrategy(
  characters: CharacterRoster | undefined,
  seat: SeatId,
): CharacterClaimStrategy {
  return characterForSeat(characters, seat).claimStrategy;
}

export function llmProviderForCharacter(character: CharacterProfile): LlmProvider {
  return character.llm.provider;
}

export function ttsProviderForCharacter(character: CharacterProfile): TtsProvider {
  return character.tts.provider;
}

export function publicCharacterRoster(
  characters: CharacterRoster,
): Array<Pick<CharacterProfile, 'seat' | 'name' | 'title' | 'portraitSrc' | 'llm' | 'tts'>> {
  return characters.map((character) => ({
    seat: character.seat,
    name: character.name,
    title: character.title,
    portraitSrc: character.portraitSrc,
    llm: character.llm,
    tts: character.tts,
  }));
}
