import type { ZodIssue } from 'zod';
import { strictCharacterProfileSchema, type CharacterProfile } from './characters';
import type { SeatId } from './types';

export interface CharacterPresetValidationError {
  path: string;
  message: string;
}

export type CharacterPresetValidationResult =
  | { success: true; character: CharacterProfile; seatWasUnassigned: boolean }
  | { success: false; errors: CharacterPresetValidationError[] };

interface CharacterPresetValidationOptions {
  targetSeat?: SeatId;
  existingCharacters?: CharacterProfile[];
}

function issuePath(issue: ZodIssue): string {
  return issue.path.length > 0 ? issue.path.map(String).join('.') : '$';
}

function issueMessage(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `必須フィールドがないか、値の型が違います。${issue.message}`;
    case 'too_small':
      return `値が短すぎるか、最小値未満です。${issue.message}`;
    case 'too_big':
      return `値が長すぎるか、最大値を超えています。${issue.message}`;
    case 'invalid_value':
      return `許可されていない値です。${issue.message}`;
    case 'unrecognized_keys':
      return `未対応のフィールドがあります。${issue.message}`;
    default:
      return issue.message;
  }
}

function issuesFromZod(issues: ZodIssue[]): CharacterPresetValidationError[] {
  return issues.map((issue) => ({ path: issuePath(issue), message: issueMessage(issue) }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnassignedSeat(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function portableSeatIssues(value: unknown): CharacterPresetValidationError[] {
  if (!isRecord(value) || !isUnassignedSeat(value.seat)) return [];
  const issues: CharacterPresetValidationError[] = [];
  if (isRecord(value.tts) && isRecord(value.tts.voice) && !isUnassignedSeat(value.tts.voice.seat)) {
    issues.push({ path: 'tts.voice.seat', message: '共有用プリセットでは空文字にしてください。' });
  }
  return issues;
}

function materializeUnassignedSeat(value: unknown, fallbackSeat: SeatId): { value: unknown; seatWasUnassigned: boolean } {
  if (!isRecord(value)) return { value, seatWasUnassigned: false };
  const seatWasUnassigned = isUnassignedSeat(value.seat);
  if (!seatWasUnassigned) return { value, seatWasUnassigned: false };

  const tts = isRecord(value.tts) && isRecord(value.tts.voice)
    ? { ...value.tts, voice: { ...value.tts.voice, seat: fallbackSeat } }
    : value.tts;
  return {
    seatWasUnassigned: true,
    value: {
      ...value,
      seat: fallbackSeat,
      tts,
      addressBook: value.addressBook ?? {},
    },
  };
}

function forTargetSeat(character: CharacterProfile, seat: SeatId): CharacterProfile {
  const addressBook = Object.fromEntries(
    Object.entries(character.addressBook).filter(([target]) => target !== seat),
  ) as CharacterProfile['addressBook'];
  return {
    ...character,
    seat,
    addressBook,
    tts: { ...character.tts, voice: { ...character.tts.voice, seat } },
  };
}

export function validateCharacterPreset(
  value: unknown,
  options: CharacterPresetValidationOptions = {},
): CharacterPresetValidationResult {
  const seatIssues = portableSeatIssues(value);
  const preliminaryIssues = seatIssues;
  const materialized = materializeUnassignedSeat(value, options.targetSeat ?? 'seat-1');
  const parsed = strictCharacterProfileSchema.safeParse(materialized.value);
  if (!parsed.success) return { success: false, errors: [...preliminaryIssues, ...issuesFromZod(parsed.error.issues)] };
  if (preliminaryIssues.length > 0) return { success: false, errors: preliminaryIssues };

  const character = options.targetSeat ? forTargetSeat(parsed.data, options.targetSeat) : parsed.data;
  const targetParsed = strictCharacterProfileSchema.safeParse(character);
  if (!targetParsed.success) return { success: false, errors: issuesFromZod(targetParsed.error.issues) };

  const duplicate = options.existingCharacters?.find(
    (existing) => existing.seat !== targetParsed.data.seat && existing.name === targetParsed.data.name,
  );
  if (duplicate) {
    return {
      success: false,
      errors: [{ path: 'name', message: `${duplicate.seat}ですでに使われている名前です。` }],
    };
  }

  return { success: true, character: targetParsed.data, seatWasUnassigned: materialized.seatWasUnassigned };
}

export function parseCharacterPresetJson(
  text: string,
  options: CharacterPresetValidationOptions = {},
): CharacterPresetValidationResult {
  try {
    return validateCharacterPreset(JSON.parse(text) as unknown, options);
  } catch (cause) {
    return {
      success: false,
      errors: [{
        path: '$',
        message: `JSONの構文が不正です: ${cause instanceof Error ? cause.message : '解析できませんでした。'}`,
      }],
    };
  }
}

export function formatCharacterPresetErrors(errors: CharacterPresetValidationError[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join('\n');
}
