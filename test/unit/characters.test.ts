import { describe, expect, it } from 'vitest';
import {
  characterAddressGuide, characterProfileSchema, characterRoleClaimSentence, cloneDefaultCharacterRoster,
} from '@/domain/characters';
import type { DecisionContext } from '@/domain/types';
import { setupPlayers } from '@/engine/setup';
import { buildPrompts } from '@/server/ai/prompts';

describe('編集可能なキャラクター設定', () => {
  it('既存9人をそのまま有効なプリセットとして扱う', () => {
    const roster = cloneDefaultCharacterRoster();
    expect(roster).toHaveLength(9);
    expect(roster.every((profile) => characterProfileSchema.safeParse(profile).success)).toBe(true);
    expect(characterRoleClaimSentence(roster, 'seat-2', '占い師')).toBe('うち、占い師やで');
    expect(characterAddressGuide(roster, 'seat-2')).toContain('福本 源蔵は「源蔵じいちゃん」');
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
