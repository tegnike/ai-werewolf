import { NextResponse } from 'next/server';
import type { SeatId } from '@/domain/types';
import { characterForSeat } from '@/domain/characters';
import { logger } from '@/server/log';
import { getRunnerManager } from '@/server/runner';
import { getTtsStatus, synthesizeTtsSpeech } from '@/server/voicevox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const matchId = new URL(request.url).searchParams.get('matchId');
  const match = matchId ? getRunnerManager().repo.getMatch(matchId) : null;
  const legacyProvider = match?.config.ttsProvider ?? (process.env.TTS_PROVIDER === 'aivisspeech' ? 'aivisspeech' : 'voicevox');
  const providers = [...new Set(match?.config.characters?.map((character) => character.tts.provider) ?? [legacyProvider])];
  const statuses = await Promise.all(providers.map((provider) => getTtsStatus(provider)));
  return NextResponse.json({
    available: statuses.some((status) => status.available),
    providers: Object.fromEntries(statuses.map((status) => [status.provider, status.available])),
  });
}

export async function POST(request: Request) {
  let failureContext: { matchId?: string; seat?: SeatId; provider?: string } = {};
  try {
    const body = await request.json() as { matchId?: string; seat?: SeatId; text?: string };
    if (!body.matchId || !body.seat || !/^seat-[1-9]$/.test(body.seat) || typeof body.text !== 'string') {
      return NextResponse.json({ error: { code: 'INVALID_VOICE_REQUEST', message: '発言または座席が不正です。' } }, { status: 400 });
    }
    const match = getRunnerManager().repo.getMatch(body.matchId);
    if (!match) return NextResponse.json({ error: { code: 'MATCH_NOT_FOUND', message: '試合が見つかりません。' } }, { status: 404 });
    const legacyProvider = match.config.ttsProvider ?? 'voicevox';
    const character = match.config.characters ? characterForSeat(match.config.characters, body.seat) : null;
    const provider = character?.tts.provider ?? legacyProvider;
    failureContext = { matchId: body.matchId, seat: body.seat, provider };
    const voice = character?.tts.voice;
    const audio = await synthesizeTtsSpeech(provider, body.seat, body.text, voice);
    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, no-store',
        'X-TTS-Provider': provider,
      },
    });
  } catch (cause) {
    const errorCode = cause instanceof Error && /^(?:TTS|VOICEVOX|INVALID|EMPTY)_[A-Z0-9_]+$/.test(cause.message)
      ? cause.message
      : cause instanceof Error ? cause.name : 'UnknownError';
    logger.warn({ ...failureContext, errorCode }, 'TTS synthesis failed');
    return NextResponse.json({ error: { code: 'TTS_UNAVAILABLE', message: '音声を生成できませんでした。' } }, { status: 503 });
  }
}
