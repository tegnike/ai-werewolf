import type { MatchEvent, ViewMode } from '@/domain/types';
import { subscribe } from '@/server/bus';
import { getRunnerManager } from '@/server/runner';
import { projectEvents } from '@/server/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const view: ViewMode = url.searchParams.get('view') === 'gm' ? 'gm' : 'public';
  const headerSeq = Number(request.headers.get('Last-Event-ID') ?? 0);
  const fromSeq = Math.max(headerSeq, Number(url.searchParams.get('fromSeq') ?? 0));
  const repo = getRunnerManager().repo;
  if (!repo.getMatch(id)) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: '試合が見つかりません。' } }), { status: 404 });
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval>;
  const encodeEvent = (event: MatchEvent) => {
    const projected = projectEvents([event], view)[0];
    return projected ? encoder.encode(`id: ${event.seq}\nevent: match\ndata: ${JSON.stringify(projected)}\n\n`) : null;
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of repo.events(id, fromSeq)) {
        const data = encodeEvent(event);
        if (data) controller.enqueue(data);
      }
      unsubscribe = subscribe(id, (event) => {
        const data = encodeEvent(event);
        if (data) controller.enqueue(data);
      });
      ping = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 15_000);
    },
    cancel() { unsubscribe(); clearInterval(ping); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
