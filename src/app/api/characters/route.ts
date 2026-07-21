import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { strictCharacterProfileSchema } from '@/domain/characters';
import { getRunnerManager } from '@/server/runner';
import { modelForProvider } from '@/server/ai/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const repo = getRunnerManager().repo;
  return NextResponse.json({
    characters: repo.characterRoster(),
    customizedSeats: repo.customizedCharacterSeats(),
    llmModels: { openai: modelForProvider('openai'), gemini: modelForProvider('gemini') },
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { character?: unknown };
    const character = strictCharacterProfileSchema.parse(body.character);
    return NextResponse.json({ character: getRunnerManager().repo.saveCharacter(character) });
  } catch (error) {
    const duplicate = error instanceof Error && error.message === 'CHARACTER_NAME_DUPLICATE';
    return NextResponse.json({
      error: {
        code: duplicate ? 'CHARACTER_NAME_DUPLICATE' : 'INVALID_CHARACTER',
        message: duplicate ? '同じ名前のキャラクターがすでにいます。' : error instanceof ZodError
          ? error.issues[0]?.message ?? 'キャラクター設定が不正です。'
          : 'キャラクター設定を保存できませんでした。',
      },
    }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { seat?: string };
    if (!body.seat) throw new Error('CHARACTER_NOT_FOUND');
    return NextResponse.json({ character: getRunnerManager().repo.resetCharacter(body.seat) });
  } catch {
    return NextResponse.json({ error: { code: 'CHARACTER_NOT_FOUND', message: 'キャラクターが見つかりません。' } }, { status: 404 });
  }
}
