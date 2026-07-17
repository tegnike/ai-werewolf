import { z } from 'zod';
import type { SeatId } from '@/domain/types';

const motivationSchema = z.enum(['reply', 'question', 'challenge', 'new_information', 'clarify', 'none']);

function nullableSeatSchema(legalSeats: SeatId[]) {
  return legalSeats.length > 0
    ? z.enum(legalSeats as [SeatId, ...SeatId[]]).nullable()
    : z.null();
}

export function speechDecisionSchema(legalSeats: SeatId[]) {
  return z.object({
    speech: z.string(),
    addressedTo: nullableSeatSchema(legalSeats),
    requestsReply: z.boolean(),
  });
}

export function speechIntentDecisionSchema(legalSeats: SeatId[]) {
  return z.object({
    urgency: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    motivation: motivationSchema,
    targetSeat: nullableSeatSchema(legalSeats),
  });
}

export function targetDecisionSchema(legalSeats: SeatId[]) {
  if (legalSeats.length === 0) throw new Error('No legal target');
  return z.object({
    targetSeat: z.enum(legalSeats as [SeatId, ...SeatId[]]),
    statedReason: z.string().max(120),
  });
}
