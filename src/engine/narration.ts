import { MAX_SPEECH_CODE_POINTS } from '@/domain/constants';
import { agentNameForSeat } from '@/domain/agents';
import type { SeatId } from '@/domain/types';

export function normalizeSpeech(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '……（沈黙）';
  return Array.from(trimmed).slice(0, MAX_SPEECH_CODE_POINTS).join('');
}

export function seatName(seat: SeatId | null): string {
  if (!seat) return 'なし';
  return agentNameForSeat(seat);
}
