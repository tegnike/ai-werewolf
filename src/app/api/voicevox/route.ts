import { NextResponse } from 'next/server';
import type { SeatId } from '@/domain/types';
import { getVoicevoxStatus, synthesizeAgentSpeech } from '@/server/voicevox';
import { getRunnerManager } from '@/server/runner';
import { characterForSeat } from '@/domain/characters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getVoicevoxStatus());
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { matchId?: string; seat?: SeatId; text?: string };
    if (!body.matchId || !body.seat || !/^seat-[1-9]$/.test(body.seat) || typeof body.text !== 'string') {
      return NextResponse.json({ error: { code: 'INVALID_VOICE_REQUEST', message: '発言または座席が不正です。' } }, { status: 400 });
    }
    const match = getRunnerManager().repo.getMatch(body.matchId);
    if (!match) return NextResponse.json({ error: { code: 'MATCH_NOT_FOUND', message: '試合が見つかりません。' } }, { status: 404 });
    const voice = match.config.characters ? characterForSeat(match.config.characters, body.seat).voice : undefined;
    const audio = await synthesizeAgentSpeech(body.seat, body.text, voice);
    return new Response(audio, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: { code: 'VOICEVOX_UNAVAILABLE', message: 'VOICEVOXで音声を生成できませんでした。' } }, { status: 503 });
  }
}
