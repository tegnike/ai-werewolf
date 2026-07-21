import { describe, expect, it } from 'vitest';
import {
  addressTermForStyle, characterAddressGuide, characterProfileSchema, characterRoleClaimSentence, cloneDefaultCharacterRoster,
  withoutReplacedCharacterDefaultAddresses,
} from '@/domain/characters';
import { parseCharacterPresetJson, validateCharacterPreset } from '@/domain/character-preset-validation';
import type { DecisionContext } from '@/domain/types';
import { assignCharacterSeats } from '@/engine/character-seating';
import { setupPlayers } from '@/engine/setup';
import { buildPrompts } from '@/server/ai/prompts';

describe('編集可能なキャラクター設定', () => {
  it('既存9人をそのまま有効なプリセットとして扱う', () => {
    const roster = cloneDefaultCharacterRoster();
    expect(roster).toHaveLength(9);
    expect(roster.every((profile) => characterProfileSchema.safeParse(profile).success)).toBe(true);
    expect(characterRoleClaimSentence(roster, 'seat-2', '占い師')).toBe('うち、占い師やで');
    expect(characterAddressGuide(roster, 'seat-2')).toContain('福本 源蔵は「源蔵じいちゃん」');
    expect(roster.every((profile) => profile.llm.provider === 'openai' && profile.llm.reasoningEffort === 'low')).toBe(true);
    expect(roster.every((profile) => profile.tts.provider === 'voicevox')).toBe(true);
  });

  it('旧保存データは排他的形式へ変換し、共有JSONでは新形式だけを受け付ける', () => {
    const character = cloneDefaultCharacterRoster()[0];
    const legacy = {
      ...character,
      llmProvider: 'gemini', openaiReasoningEffort: 'high', geminiThinkingBudget: 8_192,
      ttsProvider: 'aivisspeech', voice: character.tts.voice,
      aivisSpeechVoice: { ...character.tts.voice, speakerId: 888753760 },
    } as Record<string, unknown>;
    delete legacy.llm;
    delete legacy.tts;
    delete legacy.defaultAddressStyle;
    const stored = characterProfileSchema.parse(legacy);
    expect(stored).toMatchObject({
      defaultAddressStyle: 'full_name',
      llm: { provider: 'gemini', thinkingBudget: 8_192 },
      tts: { provider: 'aivisspeech', voice: { speakerId: 888753760 } },
    });
    const portable = validateCharacterPreset(legacy);
    expect(portable.success).toBe(false);
    if (!portable.success) {
      expect(portable.errors.map((error) => error.path)).toEqual(expect.arrayContaining(['llm', 'tts', '$']));
    }
  });

  it('LLMとTTSは選択したプロバイダー用の設定だけを保持する', () => {
    const character = cloneDefaultCharacterRoster()[0];
    const configured = {
      ...character,
      llm: { provider: 'gemini' as const, thinkingBudget: 8_192 },
      tts: {
        provider: 'aivisspeech' as const,
        voice: { ...character.tts.voice, speakerId: 888753760, speakerName: 'Anneli' },
      },
    };
    expect(characterProfileSchema.safeParse(configured).success).toBe(true);
    expect(configured.llm).not.toHaveProperty('reasoningEffort');
    expect(configured.tts).toEqual({
      provider: 'aivisspeech',
      voice: expect.objectContaining({ speakerId: 888753760, speakerName: 'Anneli' }),
    });
    expect(characterProfileSchema.safeParse({
      ...configured,
      llm: { ...configured.llm, reasoningEffort: 'high' },
    }).success).toBe(false);
  });

  it('プリセットJSONの全問題をフィールドパス付きで返す', () => {
    const invalid = {
      ...cloneDefaultCharacterRoster()[0],
      name: '',
      roleClaimTemplate: '私は占い師です',
      addressBook: { 'seat-2': '' },
    };
    const result = validateCharacterPreset(invalid);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.map((error) => error.path)).toEqual(expect.arrayContaining([
      'name', 'roleClaimTemplate', 'addressBook.seat-2',
    ]));
  });

  it('JSON構文と未知フィールドを検出し、席未定プリセットを受け付ける', () => {
    const malformed = parseCharacterPresetJson('{"seat":');
    expect(malformed.success).toBe(false);
    if (!malformed.success) expect(malformed.errors[0]).toMatchObject({ path: '$' });

    const character = cloneDefaultCharacterRoster()[0];
    expect(validateCharacterPreset({ ...character, unknownSetting: true }).success).toBe(false);
    expect(validateCharacterPreset({
      ...character, addressBook: { ...character.addressBook, 'seat-10': '知らない人' },
    }).success).toBe(false);

    const portable = validateCharacterPreset({
      ...character,
      seat: '',
      addressBook: {},
      tts: { ...character.tts, voice: { ...character.tts.voice, seat: '' } },
    });
    expect(portable.success).toBe(true);
    if (portable.success) {
      expect(portable.seatWasUnassigned).toBe(true);
      expect(portable.character.seat).toBe('seat-1');
      expect(portable.character.addressBook).toEqual({});
    }
    const partiallyAssigned = validateCharacterPreset({
      ...character,
      seat: '',
      addressBook: {},
      tts: { ...character.tts, voice: { ...character.tts.voice, seat: 'seat-1' } },
    });
    expect(partiallyAssigned.success).toBe(false);
    if (!partiallyAssigned.success) {
      expect(partiallyAssigned.errors).toContainEqual({
        path: 'tts.voice.seat', message: '共有用プリセットでは空文字にしてください。',
      });
    }
  });

  it('アップロード先以外ですでに使われている名前を検出する', () => {
    const roster = cloneDefaultCharacterRoster();
    const result = validateCharacterPreset({ ...roster[0], name: roster[1].name }, {
      targetSeat: 'seat-1', existingCharacters: roster,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors).toEqual([{ path: 'name', message: 'seat-2ですでに使われている名前です。' }]);
  });

  it('試合seedでキャラクターの席を決定し、音声と既存の呼称を追従させる', () => {
    const roster = cloneDefaultCharacterRoster();
    const assigned = assignCharacterSeats(roster, 'community-roster');
    expect(assignCharacterSeats(roster, 'community-roster')).toEqual(assigned);
    expect(assigned.map((character) => character.name).sort()).toEqual(roster.map((character) => character.name).sort());
    expect(assigned.every((character) => character.tts.voice.seat === character.seat)).toBe(true);
    expect(assigned.every((character) => character.llm.provider === 'openai' && character.tts.provider === 'voicevox')).toBe(true);

    const mio = assigned.find((character) => character.name === '名取 澪');
    const hinata = assigned.find((character) => character.name === '天満 ひなた');
    expect(mio?.addressBook[hinata!.seat]).toBe(roster[0].addressBook['seat-2']);
  });

  it('個別呼称がない相手には大まかな呼称スタイルを適用し、個別設定を優先する', () => {
    const roster = cloneDefaultCharacterRoster();
    roster[0] = { ...roster[0], defaultAddressStyle: 'family_name_san', addressBook: {} };
    expect(characterAddressGuide(roster, 'seat-1')).toContain('天満 ひなたは「天満さん」');
    roster[0].addressBook['seat-2'] = 'ひなたっち';
    expect(characterAddressGuide(roster, 'seat-1')).toContain('天満 ひなたは「ひなたっち」');
    expect(addressTermForStyle('天満 ひなた', 'given_name')).toBe('ひなた');
    expect(addressTermForStyle('天満 ひなた', 'given_name_chan')).toBe('ひなたちゃん');
    expect(addressTermForStyle('天満 ひなた', 'full_name_san')).toBe('天満 ひなたさん');
  });

  it('保存枠を別キャラクターへ置き換えたら旧既定キャラ名の呼称だけを外す', () => {
    const roster = cloneDefaultCharacterRoster();
    roster[1] = { ...roster[1], name: 'AIニケちゃん', addressBook: {} };
    expect(roster[6].addressBook['seat-2']).toBe('ひなた');

    const sanitized = withoutReplacedCharacterDefaultAddresses(roster);
    expect(sanitized[6].addressBook['seat-2']).toBeUndefined();
    expect(characterAddressGuide(sanitized, 'seat-7')).toContain('AIニケちゃんは「AIニケちゃん」');

    roster[6] = { ...roster[6], addressBook: { ...roster[6].addressBook, 'seat-2': 'ニケちゃん' } };
    expect(withoutReplacedCharacterDefaultAddresses(roster)[6].addressBook['seat-2']).toBe('ニケちゃん');
  });

  it('試合へ渡したスナップショットの人格・呼称・役職方針をプロンプトに使う', () => {
    const characters = cloneDefaultCharacterRoster();
    characters[1] = {
      ...characters[1], name: '星野 アオ', firstPerson: '僕', title: '静かな観測者',
      coreDrive: '相手の言葉を最後まで聞く。', roleClaimTemplate: '僕が{role}だよ',
      addressBook: { ...characters[1].addressBook, 'seat-1': '澪さん' },
      roleBehaviors: { ...characters[1].roleBehaviors, villager: '急がず、公開された発言を比較する。' },
    };
    const players = setupPlayers('custom-character', characters);
    players[1] = { ...players[1], role: 'villager' };
    const context: DecisionContext = {
      matchId: 'test', callKey: 'custom-seat-2', seed: 'custom-character', day: 1, phase: 'discussion', kind: 'speech',
      actor: players[1], players, legalTargets: [], publicHistory: [], privateFacts: [], characters,
      discussion: { stage: 'opening', turn: 1, spokenSeats: [], remainingUnspokenSeats: players.map((player) => player.seat), canRequestReply: true },
    };
    const prompt = buildPrompts(context).systemPrompt;
    expect(prompt).toContain('あなたは星野 アオ');
    expect(prompt).toContain('人物像: 「静かな観測者」');
    expect(prompt).toContain('一人称は「僕」');
    expect(prompt).toContain('名取 澪は「澪さん」');
    expect(prompt).toContain('急がず、公開された発言を比較する。');
  });
});
