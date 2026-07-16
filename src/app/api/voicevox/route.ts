import { NextResponse } from 'next/server';
import type { SeatId } from '@/domain/types';
import { getVoicevoxStatus, synthesizeAgentSpeech } from '@/server/voicevox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getVoicevoxStatus());
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { seat?: SeatId; text?: string };
    if (!body.seat || !/^seat-[1-9]$/.test(body.seat) || typeof body.text !== 'string') {
      return NextResponse.json({ error: { code: 'INVALID_VOICE_REQUEST', message: '発言または座席が不正です。' } }, { status: 400 });
    }
    const audio = await synthesizeAgentSpeech(body.seat, body.text);
    return new Response(audio, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: { code: 'VOICEVOX_UNAVAILABLE', message: 'VOICEVOXで音声を生成できませんでした。' } }, { status: 503 });
  }
}
