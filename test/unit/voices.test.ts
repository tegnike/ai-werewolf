import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_VOICES, voiceForSeat } from '@/domain/voices';
import {
  splitTtsText,
  synthesizeAgentSpeech,
  synthesizeTtsSpeech,
  TTS_MAX_CHUNK_LENGTH,
  TTS_SPEED_SCALE,
} from '@/server/voicevox';
import {
  AI_WEREWOLF_DICTIONARY,
  syncAgentNameDictionary,
  syncAivisSpeechDictionary,
} from '@/server/voicevox-user-dictionary';

afterEach(() => vi.unstubAllGlobals());

function testWav(data: number[]): ArrayBuffer {
  const output = new Uint8Array(44 + data.length + (data.length % 2));
  const view = new DataView(output.buffer);
  const writeId = (offset: number, id: string) => {
    for (let index = 0; index < 4; index += 1) output[offset + index] = id.charCodeAt(index);
  };
  writeId(0, 'RIFF');
  view.setUint32(4, output.length - 8, true);
  writeId(8, 'WAVE');
  writeId(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24_000, true);
  view.setUint32(28, 48_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeId(36, 'data');
  view.setUint32(40, data.length, true);
  output.set(data, 44);
  return output.buffer as ArrayBuffer;
}

describe('VOICEVOX話者割り当て', () => {
  it('9座席を9人の異なるキャラクターへ固定する', () => {
    expect(AGENT_VOICES).toHaveLength(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.seat)).size).toBe(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.speakerName)).size).toBe(9);
    expect(new Set(AGENT_VOICES.map((voice) => voice.speakerId)).size).toBe(9);
    expect(voiceForSeat('seat-1')?.speakerName).toBe('四国めたん');
    expect(voiceForSeat('seat-2')).toMatchObject({ speakerId: 70, speakerName: '満別花丸', styleName: '元気', presentation: 'female' });
    expect(voiceForSeat('seat-8')).toMatchObject({ speakerId: 42, speakerName: 'ちび式じい', presentation: 'male' });
    expect(voiceForSeat('seat-9')?.speakerName).toBe('冥鳴ひまり');
  });

  it('全話者の合成クエリへ1.1倍の話速を適用する', async () => {
    const synthesisBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.body) {
        synthesisBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      return Response.json({ speedScale: 1, volumeScale: 1, prePhonemeLength: 0.1, postPhonemeLength: 0.1 });
    });
    vi.stubGlobal('fetch', fetchMock);

    for (const voice of AGENT_VOICES) {
      await synthesizeAgentSpeech(voice.seat, `${voice.seat}の話速確認です。`, voice);
    }

    expect(TTS_SPEED_SCALE).toBe(1.1);
    expect(synthesisBodies).toHaveLength(AGENT_VOICES.length);
    expect(synthesisBodies.every((body) => body.speedScale === 1.1)).toBe(true);
  });

  it('AivisSpeechでも話速を1.1倍にし、それ以外の互換Engine固有値を維持する', async () => {
    const audioQuery = { speedScale: 0.95, volumeScale: 0.8, customField: 'aivis' };
    const synthesisBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.body) {
        synthesisBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      return Response.json(audioQuery);
    });
    vi.stubGlobal('fetch', fetchMock);

    for (const voice of AGENT_VOICES) {
      await synthesizeTtsSpeech('aivisspeech', voice.seat, `${voice.seat}のAivisSpeech話速確認です。`, voice);
    }

    expect(synthesisBodies).toHaveLength(AGENT_VOICES.length);
    expect(synthesisBodies.every((body) => JSON.stringify(body) === JSON.stringify({ ...audioQuery, speedScale: 1.1 }))).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('127.0.0.1:10101/audio_query');
  });

  it('複数タブ相当の同時要求も同一TTS Engineへは1件ずつ送る', async () => {
    let activeRequests = 0;
    let maxConcurrency = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      activeRequests += 1;
      maxConcurrency = Math.max(maxConcurrency, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeRequests -= 1;
      const url = String(input instanceof Request ? input.url : input);
      return url.includes('/audio_query')
        ? Response.json({ speedScale: 1 })
        : new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      synthesizeTtsSpeech('voicevox', 'seat-1', '一人目です。'),
      synthesizeTtsSpeech('voicevox', 'seat-2', '二人目です。'),
    ]);

    expect(maxConcurrency).toBe(1);
  });

  it('句読点と実試合で多い感嘆符・疑問符・三点リーダーを順序どおり分割する', () => {
    const text = '最初です。次です！質問です？少し考える……続けます♪';
    const chunks = splitTtsText(text);

    expect(chunks).toEqual(['最初です。', '次です！', '質問です？', '少し考える……', '続けます♪']);
    expect(chunks.join('')).toBe(text);
  });

  it('長い一文は読点で分割し、区切りのない部分も上限を超えない', () => {
    const text = `前半の説明を置きます、${'長い情報'.repeat(12)}、最後に結論を述べます。`;
    const chunks = splitTtsText(text);

    expect(chunks.join('')).toBe(text);
    expect(chunks.every((chunk) => Array.from(chunk).length <= TTS_MAX_CHUNK_LENGTH)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('分割した音声を直列合成し、発言順のまま一つのWAVへ結合する', async () => {
    const requests: string[] = [];
    let synthesisIndex = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === '/audio_query') {
        requests.push(`query:${url.searchParams.get('text')}`);
        return Response.json({ speedScale: 1 });
      }
      synthesisIndex += 1;
      requests.push(`synthesis:${synthesisIndex}`);
      return new Response(testWav([synthesisIndex, synthesisIndex + 10]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const audio = await synthesizeTtsSpeech('aivisspeech', 'seat-1', '最初です。次です。');
    const output = new Uint8Array(audio);

    expect(requests).toEqual([
      'query:最初です。',
      'synthesis:1',
      'query:次です。',
      'synthesis:2',
    ]);
    expect(new TextDecoder().decode(output.slice(36, 40))).toBe('data');
    expect([...output.slice(44, 48)]).toEqual([1, 11, 2, 12]);
  });

  it('人狼と漢字名の読みをVOICEVOXユーザー辞書へ追加する', async () => {
    const requests: Array<{ method: string; url: URL }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push({ method: init?.method ?? 'GET', url });
      if (url.pathname === '/user_dict') return Response.json({});
      return Response.json('word-uuid');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncAgentNameDictionary('http://voicevox.test:50021');

    expect(result.added).toHaveLength(AI_WEREWOLF_DICTIONARY.length);
    expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(AI_WEREWOLF_DICTIONARY.length);
    const werewolf = requests.find(({ url }) => url.searchParams.get('surface') === '人狼');
    expect(werewolf?.url.searchParams.get('pronunciation')).toBe('ジンロー');
    expect(Object.fromEntries(requests.map(({ url }) => [
      url.searchParams.get('surface'),
      {
        pronunciation: url.searchParams.get('pronunciation'),
        accentType: url.searchParams.get('accent_type'),
      },
    ]))).toMatchObject({
      '無情報': { pronunciation: 'ムジョウホウ', accentType: '2' },
      '霊花': { pronunciation: 'レイカ', accentType: '1' },
      '夜汐': { pronunciation: 'ヤセキ', accentType: '1' },
      '花音': { pronunciation: 'カノン', accentType: '1' },
      '浅見': { pronunciation: 'アサミ', accentType: '3' },
      '珪花': { pronunciation: 'ケイカ', accentType: '1' },
    });
    const tenma = requests.find(({ url }) => url.searchParams.get('surface') === '天満');
    expect(tenma?.url.searchParams.get('pronunciation')).toBe('テンマ');
    const genzo = requests.find(({ url }) => url.searchParams.get('surface') === '源蔵');
    expect(genzo?.url.searchParams.get('pronunciation')).toBe('ゲンゾー');
    const kuon = requests.find(({ url }) => url.searchParams.get('surface') === '久遠');
    expect(kuon?.url.searchParams.get('pronunciation')).toBe('クオン');
    expect(kuon?.url.searchParams.get('word_type')).toBe('PROPER_NOUN');
    const kuonSan = requests.find(({ url }) => url.searchParams.get('surface') === '久遠さん');
    expect(kuonSan?.url.searchParams.get('pronunciation')).toBe('クオンサン');
  });

  it('同じ辞書をAivisSpeechユーザー辞書へ追加する', async () => {
    const requests: URL[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url);
      if (url.pathname === '/user_dict') return Response.json({});
      return Response.json('word-uuid');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncAivisSpeechDictionary('http://aivis.test:10101');

    expect(result.added).toHaveLength(AI_WEREWOLF_DICTIONARY.length);
    expect(requests.every((url) => url.origin === 'http://aivis.test:10101')).toBe(true);
    const werewolf = requests.find((url) => url.searchParams.get('surface') === '人狼');
    expect(werewolf?.searchParams.get('pronunciation')).toBe('ジンロー');
    expect(Object.fromEntries(requests.map((url) => [
      url.searchParams.get('surface'),
      url.searchParams.get('pronunciation'),
    ]))).toMatchObject({
      '無情報': 'ムジョウホウ',
      '霊花': 'レイカ',
      '夜汐': 'ヤセキ',
      '花音': 'カノン',
      '浅見': 'アサミ',
      '珪花': 'ケイカ',
    });
  });

  it('登録済みの正しい読みは重複登録しない', async () => {
    const dictionary = Object.fromEntries(AI_WEREWOLF_DICTIONARY.map((entry, index) => [`word-${index}`, {
      surface: entry.surface,
      pronunciation: entry.pronunciation,
      accent_type: entry.accentType,
      priority: entry.priority ?? 8,
    }]));
    const fetchMock = vi.fn(async () => Response.json(dictionary));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncAgentNameDictionary('http://voicevox.test:50021');

    expect(result.unchanged).toHaveLength(AI_WEREWOLF_DICTIONARY.length);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
