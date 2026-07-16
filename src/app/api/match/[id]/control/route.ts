import { NextResponse } from 'next/server';
import { getRunnerManager } from '@/server/runner';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json() as { action?: 'pause' | 'resume' | 'abort' | 'retry'; speed?: number };
  if (!body.action || !['pause', 'resume', 'abort', 'retry'].includes(body.action)) {
    return NextResponse.json({ error: { code: 'INVALID_ACTION', message: '操作が不正です。' } }, { status: 400 });
  }
  try {
    getRunnerManager().control(id, body.action, body.speed);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: '試合が見つかりません。' } }, { status: 404 });
  }
}
