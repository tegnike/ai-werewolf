import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatCharacterPresetErrors, parseCharacterPresetJson } from '../src/domain/character-preset-validation';
import { SEATS } from '../src/domain/constants';
import type { SeatId } from '../src/domain/types';

interface Arguments {
  files: string[];
  targetSeat?: SeatId;
}

function usage(): string {
  return [
    '使い方:',
    '  npm run character:validate -- <preset.json> [preset.json ...]',
    '  npm run character:validate -- --seat seat-3 <preset.json>',
  ].join('\n');
}

function parseArguments(argv: string[]): Arguments {
  const files: string[] = [];
  let targetSeat: SeatId | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--seat') {
      const value = argv[index + 1];
      if (!value || !SEATS.includes(value as SeatId)) {
        throw new Error(`--seatには${SEATS.join('、')}のいずれかを指定してください。`);
      }
      targetSeat = value as SeatId;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) throw new Error(`未対応のオプションです: ${argument}`);
    files.push(argument);
  }

  if (files.length === 0) throw new Error('検証するJSONファイルを指定してください。');
  return { files, targetSeat };
}

async function main(): Promise<void> {
  let args: Arguments;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : '引数が不正です。');
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  let failed = false;
  for (const file of args.files) {
    const absolutePath = resolve(file);
    let text: string;
    try {
      text = await readFile(absolutePath, 'utf8');
    } catch (cause) {
      failed = true;
      console.error(`NG ${file}`);
      console.error(`$: ファイルを読み込めません: ${cause instanceof Error ? cause.message : '不明なエラー'}`);
      continue;
    }

    const result = parseCharacterPresetJson(text, { targetSeat: args.targetSeat });
    if (!result.success) {
      failed = true;
      console.error(`NG ${file} (${result.errors.length}件)`);
      console.error(formatCharacterPresetErrors(result.errors));
      continue;
    }
    const placement = result.seatWasUnassigned && !args.targetSeat ? '席未定' : result.character.seat;
    console.log(`OK ${file} (${placement}: ${result.character.name})`);
  }

  if (failed) process.exitCode = 1;
}

void main();
