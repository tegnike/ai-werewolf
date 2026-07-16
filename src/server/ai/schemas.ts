import { z } from 'zod';
import type { SeatId } from '@/domain/types';

export const SpeechDecisionSchema = z.object({ speech: z.string() });
export function targetDecisionSchema(legalSeats: SeatId[]) {
  if (legalSeats.length === 0) throw new Error('No legal target');
  return z.object({
    targetSeat: z.enum(legalSeats as [SeatId, ...SeatId[]]),
    statedReason: z.string().max(120),
  });
}
