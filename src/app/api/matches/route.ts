import { NextResponse } from 'next/server';
import { getRunnerManager } from '@/server/runner';
import { projectMatch } from '@/server/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const matches = getRunnerManager().repo.listMatches().map((match) => projectMatch(match, 'public'));
  const aiProvider = process.env.AI_PROVIDER === 'real' ? 'real' : 'mock';
  return NextResponse.json({ matches, aiProvider });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { seed?: string; speed?: number };
    const allowedSpeeds = new Set([0, 1500, 3000]);
    if (body.speed !== undefined && !allowedSpeeds.has(body.speed)) {
      return NextResponse.json({ error: { code: 'INVALID_SPEED', message: '速度が不正です。' } }, { status: 400 });
    }
    const ai = process.env.AI_PROVIDER === 'real' ? 'real' : 'mock';
    const match = getRunnerManager().create({
      seed: body.seed,
      speed: body.speed,
      ai,
    });
    return NextResponse.json({
      id: match.id,
      seed: match.seed,
      ai,
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'CREATE_FAILED';
    const realAiUnavailable = code === 'REAL_AI_NOT_ALLOWED' || code === 'REAL_AI_NOT_CONFIGURED';
    const status = code === 'MATCH_LIMIT_REACHED' ? 409 : realAiUnavailable ? 503 : 500;
    const message = code === 'MATCH_LIMIT_REACHED' ? '同時進行できる試合は2件までです。' : realAiUnavailable ? '実AIの起動条件が不足しています。サーバー設定を確認してください。' : '試合を開始できませんでした。';
    return NextResponse.json({ error: { code, message } }, { status });
  }
}
