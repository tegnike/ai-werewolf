import { NextResponse } from 'next/server';
import { getRunnerManager } from '@/server/runner';
import { canRevealSecrets, projectEvents, projectMatch } from '@/server/view';
import type { ViewMode } from '@/domain/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const view: ViewMode = url.searchParams.get('view') === 'gm' ? 'gm' : 'public';
  const fromSeq = Number(url.searchParams.get('fromSeq') ?? 0);
  const repo = getRunnerManager().repo;
  const match = repo.getMatch(id);
  if (!match) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '試合が見つかりません。' } }, { status: 404 });
  const revealSecrets = canRevealSecrets(view, match.status, url.searchParams.get('reveal') === '1');
  return NextResponse.json({ match: projectMatch(match, view), events: projectEvents(repo.events(id, fromSeq), view, revealSecrets) });
}
