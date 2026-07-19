import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_VOICES, voiceForSeat } from '@/domain/voices';
import { synthesizeAgentSpeech, VOICEVOX_SPEED_SCALE } from '@/server/voicevox';
import { AGENT_NAME_DICTIONARY, syncAgentNameDictionary } from '@/server/voicevox-user-dictionary';

afterEach(() => vi.unstubAllGlobals());

describe('VOICEVOX話者割り当て', () => {
  it('9座席を9人の異なるキャラクターへ固定する', () => {
    expect(AGENT_VOICES).toHaveLength(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.seat)).size).toBe(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.speakerName)).size).toBe(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.speakerId)).size).toBe(9);
    expect(voiceForSeat('seat-1')?.speakerName).toBe('四国めたん');
    expect(voiceForSeat('seat-9')?.speakerName).toBe('冥鳴ひまり');
  });

  it('全話者の合成クエリへ1.1倍の話速を適用する', async () => {
    let synthesisBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.body) {
        synthesisBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      return Response.json({ speedScale: 1, volumeScale: 1, prePhonemeLength: 0.1, postPhonemeLength: 0.1 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await synthesizeAgentSpeech('seat-1', '話速の確認です。');

    expect(VOICEVOX_SPEED_SCALE).toBe(1.1);
    expect(synthesisBody).toMatchObject({ speedScale: 1.1 });
  });

  it('漢字名の読みをVOICEVOXユーザー辞書へ追加する', async () => {
    const requests: Array<{ method: string; url: URL }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push({ method: init?.method ?? 'GET', url });
      if (url.pathname === '/user_dict') return Response.json({});
      return Response.json('word-uuid');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncAgentNameDictionary('http://voicevox.test:50021');

    expect(result.added).toHaveLength(AGENT_NAME_DICTIONARY.length);
    expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(AGENT_NAME_DICTIONARY.length);
    const yagi = requests.find(({ url }) => url.searchParams.get('surface') === '八木');
    expect(yagi?.url.searchParams.get('pronunciation')).toBe('ヤギ');
    expect(yagi?.url.searchParams.get('priority')).toBe('10');
    const kuon = requests.find(({ url }) => url.searchParams.get('surface') === '久遠');
    expect(kuon?.url.searchParams.get('pronunciation')).toBe('クオン');
    expect(kuon?.url.searchParams.get('word_type')).toBe('PROPER_NOUN');
    const kuonSan = requests.find(({ url }) => url.searchParams.get('surface') === '久遠さん');
    expect(kuonSan?.url.searchParams.get('pronunciation')).toBe('クオンサン');
  });

  it('登録済みの正しい読みは重複登録しない', async () => {
    const dictionary = Object.fromEntries(AGENT_NAME_DICTIONARY.map((entry, index) => [`word-${index}`, {
      surface: entry.surface,
      pronunciation: entry.pronunciation,
      accent_type: entry.accentType,
      priority: entry.priority ?? 8,
    }]));
    const fetchMock = vi.fn(async () => Response.json(dictionary));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncAgentNameDictionary('http://voicevox.test:50021');

    expect(result.unchanged).toHaveLength(AGENT_NAME_DICTIONARY.length);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
