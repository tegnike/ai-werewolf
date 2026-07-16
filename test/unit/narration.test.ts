import { describe, expect, it } from 'vitest';
import { normalizeSpeech } from '@/engine/narration';

describe('発言整形', () => {
  it('空文字を沈黙にする', () => expect(normalizeSpeech('  ')).toBe('……（沈黙）'));
  it('Unicode code pointで200文字に切り詰める', () => expect(Array.from(normalizeSpeech('🐺'.repeat(220)))).toHaveLength(200));
});
