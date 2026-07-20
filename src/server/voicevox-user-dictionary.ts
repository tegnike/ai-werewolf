const DEFAULT_VOICEVOX_URL = 'http://127.0.0.1:50021';

export interface VoicevoxDictionaryEntry {
  surface: string;
  pronunciation: string;
  accentType: number;
  priority?: number;
}

export const AGENT_NAME_DICTIONARY: readonly VoicevoxDictionaryEntry[] = [
  { surface: '名取', pronunciation: 'ナトリ', accentType: 3 },
  { surface: '澪', pronunciation: 'ミオ', accentType: 1 },
  { surface: '天満', pronunciation: 'テンマ', accentType: 1 },
  { surface: 'ひなた', pronunciation: 'ヒナタ', accentType: 1 },
  { surface: '宮下', pronunciation: 'ミヤシタ', accentType: 0 },
  { surface: '雨宮', pronunciation: 'アマミヤ', accentType: 2 },
  { surface: '神崎', pronunciation: 'カンザキ', accentType: 1 },
  { surface: '黒田', pronunciation: 'クロダ', accentType: 0 },
  { surface: '剛', pronunciation: 'ツヨシ', accentType: 1 },
  { surface: '真壁', pronunciation: 'マカベ', accentType: 0 },
  { surface: '陽太', pronunciation: 'ヨータ', accentType: 1 },
  { surface: '福本', pronunciation: 'フクモト', accentType: 0 },
  { surface: '源蔵', pronunciation: 'ゲンゾー', accentType: 1 },
  { surface: '久遠', pronunciation: 'クオン', accentType: 0 },
  { surface: '名取さん', pronunciation: 'ナトリサン', accentType: 3 },
  { surface: '澪さん', pronunciation: 'ミオサン', accentType: 1 },
  { surface: '天満さん', pronunciation: 'テンマサン', accentType: 1 },
  { surface: 'ひなたさん', pronunciation: 'ヒナタサン', accentType: 1 },
  { surface: 'ひなたちゃん', pronunciation: 'ヒナタチャン', accentType: 1 },
  { surface: '宮下さん', pronunciation: 'ミヤシタサン', accentType: 0 },
  { surface: '雨宮さん', pronunciation: 'アマミヤサン', accentType: 2 },
  { surface: '神崎さん', pronunciation: 'カンザキサン', accentType: 1 },
  { surface: '黒田さん', pronunciation: 'クロダサン', accentType: 0 },
  { surface: '剛さん', pronunciation: 'ツヨシサン', accentType: 1 },
  { surface: '真壁さん', pronunciation: 'マカベサン', accentType: 0 },
  { surface: '真壁くん', pronunciation: 'マカベクン', accentType: 0 },
  { surface: '陽太さん', pronunciation: 'ヨータサン', accentType: 1 },
  { surface: '陽太くん', pronunciation: 'ヨータクン', accentType: 1 },
  { surface: '福本さん', pronunciation: 'フクモトサン', accentType: 0 },
  { surface: '源蔵さん', pronunciation: 'ゲンゾーサン', accentType: 1 },
  { surface: '源蔵じいちゃん', pronunciation: 'ゲンゾージーチャン', accentType: 1 },
  { surface: '久遠さん', pronunciation: 'クオンサン', accentType: 0 },
];

interface VoicevoxUserDictionaryWord {
  surface: string;
  pronunciation: string;
  accent_type: number;
  priority: number;
}

type VoicevoxUserDictionary = Record<string, VoicevoxUserDictionaryWord>;

export interface VoicevoxDictionarySyncResult {
  added: string[];
  updated: string[];
  unchanged: string[];
}

const requestUrl = (baseUrl: string, path: string, entry: VoicevoxDictionaryEntry): URL => {
  const url = new URL(path, `${baseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('surface', entry.surface);
  url.searchParams.set('pronunciation', entry.pronunciation);
  url.searchParams.set('accent_type', String(entry.accentType));
  url.searchParams.set('word_type', 'PROPER_NOUN');
  url.searchParams.set('priority', String(entry.priority ?? 8));
  return url;
};

export async function syncAgentNameDictionary(
  baseUrl = process.env.VOICEVOX_URL ?? DEFAULT_VOICEVOX_URL,
): Promise<VoicevoxDictionarySyncResult> {
  const dictionaryResponse = await fetch(new URL('/user_dict', baseUrl), {
    signal: AbortSignal.timeout(5_000),
    cache: 'no-store',
  });
  if (!dictionaryResponse.ok) throw new Error(`VOICEVOX_USER_DICT_${dictionaryResponse.status}`);

  const dictionary = await dictionaryResponse.json() as VoicevoxUserDictionary;
  const wordsBySurface = new Map(Object.entries(dictionary).map(([uuid, word]) => [word.surface, { uuid, word }]));
  const result: VoicevoxDictionarySyncResult = { added: [], updated: [], unchanged: [] };

  for (const entry of AGENT_NAME_DICTIONARY) {
    const existing = wordsBySurface.get(entry.surface);
    if (!existing) {
      const response = await fetch(requestUrl(baseUrl, '/user_dict_word', entry), {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`VOICEVOX_USER_DICT_ADD_${response.status}_${entry.surface}`);
      result.added.push(entry.surface);
      continue;
    }

    if (
      existing.word.pronunciation === entry.pronunciation &&
      existing.word.accent_type === entry.accentType &&
      existing.word.priority === (entry.priority ?? 8)
    ) {
      result.unchanged.push(entry.surface);
      continue;
    }

    const response = await fetch(requestUrl(baseUrl, `/user_dict_word/${existing.uuid}`, entry), {
      method: 'PUT',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`VOICEVOX_USER_DICT_UPDATE_${response.status}_${entry.surface}`);
    result.updated.push(entry.surface);
  }

  return result;
}
