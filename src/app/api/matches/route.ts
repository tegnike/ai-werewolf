import { NextResponse } from 'next/server';
import { getRunnerManager } from '@/server/runner';
import { projectMatch } from '@/server/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const matches = getRunnerManager().repo.listMatches().map((match) => projectMatch(match, 'public'));
  return NextResponse.json({ matches });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { seed?: string; speed?: number };
    const allowedSpeeds = new Set([0, 1500, 3000]);
    if (body.speed !== undefined && !allowedSpeeds.has(body.speed)) {
      return NextResponse.json({ error: { code: 'INVALID_SPEED', message: '速度が不正です。' } }, { status: 400 });
    }
    const match = getRunnerManager().create({ seed: body.seed, speed: body.speed, ai: 'mock' });
    return NextResponse.json({ id: match.id, seed: match.seed }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'CREATE_FAILED';
    const status = code === 'MATCH_LIMIT_REACHED' ? 409 : 500;
    return NextResponse.json({ error: { code, message: code === 'MATCH_LIMIT_REACHED' ? '同時進行できる試合は2件までです。' : '試合を開始できませんでした。' } }, { status });
  }
}
