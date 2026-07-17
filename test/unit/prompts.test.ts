import { describe, expect, it } from 'vitest';
import type { DecisionContext } from '@/domain/types';
import { AGENT_PERSONAS } from '@/domain/agents';
import { roleBehaviorFor } from '@/domain/role-behaviors';
import { setupPlayers } from '@/engine/setup';
import { buildPrompts } from '@/server/ai/prompts';
import { speechDecisionSchema } from '@/server/ai/schemas';

describe('実AI人格プロンプト', () => {
  it('固有名・欠点・台詞例・話者固有の呼称表を使い、議事録調とAgent番号を避けさせる', () => {
    const players = setupPlayers('persona-prompt');
    const context: DecisionContext = {
      matchId: 'test',
      callKey: 'day-1-speech-seat-2',
      seed: 'persona-prompt',
      day: 1,
      phase: 'discussion',
      kind: 'speech',
      actor: players[1],
      players,
      legalTargets: [],
      publicHistory: ['名取 澪: 皆さんの話を聞きたいです。'],
      privateFacts: [],
      round: 1,
      discussion: {
        stage: 'opening', turn: 2, promptedBySeat: 'seat-1',
        spokenSeats: ['seat-1'], remainingUnspokenSeats: players.slice(1).map((player) => player.seat), canRequestReply: true,
      },
    };

    const { systemPrompt, decisionPrompt } = buildPrompts(context);
    expect(systemPrompt).toContain('あなたは八木 こはる');
    expect(systemPrompt).toContain('内面の矛盾と欠点');
    expect(systemPrompt).toContain('台詞の見本');
    expect(systemPrompt).toContain('他の参加者の呼び方');
    expect(systemPrompt).toContain('宮下 さくらは「さくらちゃん」');
    expect(systemPrompt).toContain('神崎 レナは「レナ」');
    expect(systemPrompt).toContain('Agent番号や別の呼び方を使わず');
    expect(systemPrompt).toContain('議事録調の語を繰り返さない');
    expect(systemPrompt).toContain('固定の開始発言順はありません');
    expect(systemPrompt).toContain('その相手が次の話者になります');
    expect(systemPrompt).toContain('addressedToに相手を指定し、requestsReply=true');
    expect(systemPrompt).toContain('名取 澪から返答を求められて次の話者になりました');
    expect(decisionPrompt).toContain('名取 澪');
    expect(decisionPrompt).toContain('八木 こはる');
  });

  it('その日の先頭話者に未発生の沈黙や反応を観察させない', () => {
    const players = setupPlayers('first-opening-speaker');
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-speech-opening-seat-1', seed: 'first-opening-speaker', day: 1,
      phase: 'discussion', kind: 'speech', actor: players[0], players,
      legalTargets: players.slice(1).map((player) => player.seat), publicHistory: [], privateFacts: [], round: 1,
      discussion: { stage: 'opening', turn: 1, spokenSeats: [], remainingUnspokenSeats: players.map((player) => player.seat), canRequestReply: true },
    };

    const prompt = buildPrompts(context).systemPrompt;
    expect(prompt).toContain('あなたが今日の最初の発言者です');
    expect(prompt).toContain('今日の沈黙、反応、便乗、返答の遅さ');
    expect(prompt).toContain('仮定、今後の方針、迷い、弱い違和感');
  });

  it('discussion v3では既出質問を重ねず疑い・盤面・投票予定を増やすよう促す', () => {
    const players = setupPlayers('discussion-v3-prompt');
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-speech-t8-seat-3', seed: 'discussion-v3-prompt', day: 1,
      phase: 'discussion', kind: 'speech', actor: players[2], players,
      legalTargets: players.filter((player) => player.seat !== players[2].seat).map((player) => player.seat),
      publicHistory: ['神崎 レナ: 私は占い師です。征司さんは人狼ではありませんでした。'],
      privateFacts: [], round: 1,
      discussion: {
        version: 'v3', stage: 'opening', turn: 8, spokenSeats: ['seat-5'],
        remainingUnspokenSeats: players.filter((player) => player.seat !== 'seat-5').map((player) => player.seat),
        canRequestReply: true,
        boardDigest: ['質問済み: inspection_reason=2回（回答1回）', '今日の貢献数: suspicion=1、defense=0、vote_intent=0、board_analysis=0'],
        agenda: ['質問だけで終えず、自分が今もっとも疑う相手と根拠を一つ示す'],
      },
    };

    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('議論台帳にすでにある質問');
    expect(prompts.systemPrompt).toContain('別々の相手へ「人狼ではない」という結果');
    expect(prompts.systemPrompt).toContain('「白」「黒」「白結果」「黒結果」のように省略しない');
    expect(prompts.systemPrompt).toContain('inspection_reason=2回');
    expect(prompts.systemPrompt).toContain('質問だけで終えず');
    expect(prompts.systemPrompt).toContain('structureは実際に口にする内容の自己分類');
    expect(prompts.decisionPrompt).toContain('structureは本文に現れる');
  });

  it('発言希望確認では台詞を作らず、黙る選択と4段階の緊急度を示す', () => {
    const players = setupPlayers('intent-prompt');
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-speech-intent-p1-seat-2', seed: 'intent-prompt', day: 1,
      phase: 'discussion', kind: 'speech_intent', actor: players[1], players,
      legalTargets: players.filter((player) => player.seat !== players[1].seat).map((player) => player.seat),
      publicHistory: Array.from({ length: 40 }, (_, index) => `履歴-${String(index + 1).padStart(2, '0')}`), privateFacts: [],
      discussion: { stage: 'free', turn: 1, promptedBySeat: 'seat-1' },
    };

    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('実際の発言ではなく');
    expect(prompts.systemPrompt).toContain('0=今は黙る');
    expect(prompts.systemPrompt).toContain('台詞や長い理由は作らない');
    expect(prompts.decisionPrompt).toContain('urgency=0');
    expect(prompts.decisionPrompt).not.toContain('履歴-01');
    expect(prompts.decisionPrompt).toContain('履歴-40');
  });

  it('占い結果の初回公開では自然な日本語で占い師を名乗らせる', () => {
    const players = setupPlayers('persona-prompt');
    const seer = { ...players[1], role: 'seer' as const };
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-seer-speech', seed: 'persona-prompt', day: 1, phase: 'discussion', kind: 'speech',
      actor: seer, players: players.map((player) => player.seat === seer.seat ? seer : player), legalTargets: [],
      publicHistory: ['真壁 陽太: 占いCOです。', '青木 征司: 霊媒師COです。'],
      privateFacts: ['自分の役職: seer', '青木 征司: 人狼'], round: 1,
    };
    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('必ず同じ発言内で「私は占い師です」');
    expect(prompts.systemPrompt).toContain('アルファベットの略語を使わず');
    expect(prompts.decisionPrompt).toContain('占い師だと名乗りました');
    expect(prompts.decisionPrompt).toContain('霊媒師だと名乗りました');
    expect(`${prompts.systemPrompt}\n${prompts.decisionPrompt}`).not.toMatch(/(?:^|[^A-Za-z])(?:CO|ＣＯ)(?=$|[^A-Za-z])/i);
  });

  it('claims v1では知ってよい情報と認可された戦術的主張を分離する', () => {
    const players = setupPlayers('claim-prompt');
    const actor = { ...players[0], role: 'madman' as const };
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-fake-seer', seed: 'claim-prompt', day: 1, phase: 'discussion', kind: 'speech',
      actor, players: players.map((player) => player.seat === actor.seat ? actor : player), legalTargets: [],
      publicHistory: [], privateFacts: ['自分の役職: madman'], discussion: { stage: 'opening', turn: 1 },
      claimBoard: ['八木 こはるは占い師を名乗っています'],
      claimDirective: {
        mode: 'must', claimedRole: 'seer', counterTargetSeat: 'seat-2',
        results: [{ day: 0, targetSeat: 'seat-3', verdict: '人狼' }],
      },
    };
    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('判断材料にしてよいのは');
    expect(prompts.systemPrompt).toContain('ゲームで認められた戦術');
    expect(prompts.systemPrompt).toContain('今回は必ず「私は占い師です」と名乗り');
    expect(prompts.decisionPrompt).toContain('authorizedClaim');
    expect(prompts.decisionPrompt).toContain('claimBoard');
    expect(prompts.decisionPrompt).not.toContain('本物');
    expect(prompts.decisionPrompt).not.toContain('偽物');
  });

  it('claimを伏せる場合は能力結果や確認済み正体の匂わせも禁止する', () => {
    const players = setupPlayers('hidden-result-prompt');
    const seer = { ...players[0], role: 'seer' as const };
    const prompts = buildPrompts({
      matchId: 'test', callKey: 'd1-hidden-result', seed: 'hidden-result-prompt', day: 1,
      phase: 'discussion', kind: 'speech', actor: seer,
      players: players.map((player) => player.seat === seer.seat ? seer : player),
      legalTargets: players.slice(1).map((player) => player.seat), publicHistory: [],
      privateFacts: ['自分の役職: seer', '黒田 剛: 人狼ではない'], round: 1,
      discussion: { stage: 'opening', turn: 1, spokenSeats: [], remainingUnspokenSeats: players.map((player) => player.seat), canRequestReply: true },
      claimBoard: [],
      claimDirective: { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null },
    });

    expect(prompts.systemPrompt).toContain('確認済みの正体');
    expect(prompts.systemPrompt).toContain('村人だと確認できている');
    expect(prompts.systemPrompt).toContain('結果はあるが今は言えない');
  });

  it('単独人狼の夜会話を返答不能な独り言として指示する', () => {
    const players = setupPlayers('lone-wolf-prompt');
    const actor = { ...players[0], role: 'werewolf' as const, alive: true };
    const deadAlly = { ...players[1], role: 'werewolf' as const, alive: false };
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd2-wolf-chat-r1-seat-1', seed: 'lone-wolf-prompt', day: 2,
      phase: 'wolf_chat', kind: 'wolf_speech', actor,
      players: players.map((player) => player.seat === actor.seat ? actor : player.seat === deadAlly.seat ? deadAlly : player),
      legalTargets: [], publicHistory: [],
      privateFacts: ['自分の役職: werewolf', '生存中の人狼仲間: なし（自分だけ）', `死亡した人狼仲間: ${deadAlly.name}`],
      round: 1,
      wolfChat: { mode: 'monologue', participantSeats: [actor.seat] },
    };

    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('完全な独り言');
    expect(prompts.systemPrompt).toContain('死亡した仲間はこの会話を聞けず、返答もできません');
    expect(prompts.systemPrompt).toContain('誰かへの呼びかけ、質問、同意や返事の要求');
    expect(prompts.decisionPrompt).toContain('addressedTo=null、requestsReply=false');

    const schema = speechDecisionSchema([], false, false);
    expect(schema.safeParse({ speech: '一人で決める。', addressedTo: null, requestsReply: false }).success).toBe(true);
    expect(schema.safeParse({ speech: 'どう思う？', addressedTo: null, requestsReply: true }).success).toBe(false);
    expect(speechDecisionSchema(['seat-2'], false, true)
      .safeParse({ speech: '誰か答えてください。', addressedTo: null, requestsReply: true }).success).toBe(false);
  });

  it('discussion v3 schemaで発言本文に対応する構造化貢献を必須にする', () => {
    const schema = speechDecisionSchema(['seat-2'], false, true, ['seat-2']);
    expect(schema.safeParse({
      speech: 'こはるさんの便乗が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-2', basis: 'interaction' }, voteIntent: null, boardAnalysis: false,
      },
    }).success).toBe(true);
    expect(schema.safeParse({
      speech: 'どう思いますか？', addressedTo: 'seat-2', requestsReply: true,
      structure: { primaryAct: 'question', questionTopic: null, suspicion: null, voteIntent: null, boardAnalysis: false },
    }).success).toBe(false);
    expect(schema.safeParse({ speech: '発言します。', addressedTo: null, requestsReply: false }).success).toBe(false);

    const closedTopicSchema = speechDecisionSchema(['seat-2'], false, true, ['seat-2'], ['inspection_reason']);
    expect(closedTopicSchema.safeParse({
      speech: '占い理由を答えてください。', addressedTo: 'seat-2', requestsReply: true,
      structure: { primaryAct: 'question', questionTopic: 'inspection_reason', suspicion: null, voteIntent: null, boardAnalysis: false },
    }).success).toBe(false);
    expect(closedTopicSchema.safeParse({
      speech: '占い理由には答えました。', addressedTo: null, requestsReply: false,
      structure: { primaryAct: 'answer', questionTopic: 'inspection_reason', suspicion: null, voteIntent: null, boardAnalysis: false },
    }).success).toBe(true);
  });

  it('実際の席と役職に対応する行動方針だけを機械的に差し込む', () => {
    const basePlayers = setupPlayers('role-behavior-prompt');
    const roles = ['villager', 'werewolf', 'seer', 'medium', 'bodyguard', 'madman'] as const;

    for (const persona of AGENT_PERSONAS) {
      for (const role of roles) {
        const actor = { ...basePlayers.find((player) => player.seat === persona.seat)!, role };
        const context: DecisionContext = {
          matchId: 'test', callKey: `${persona.seat}-${role}`, seed: 'role-behavior-prompt', day: 1,
          phase: 'discussion', kind: 'speech', actor,
          players: basePlayers.map((player) => player.seat === actor.seat ? actor : player),
          legalTargets: [], publicHistory: [], privateFacts: [], round: 1,
        };
        const prompt = buildPrompts(context).systemPrompt;

        expect(prompt).toContain(`この人格が`);
        expect(prompt).toContain(roleBehaviorFor(persona.seat, role));
        for (const otherRole of roles.filter((candidate) => candidate !== role)) {
          expect(prompt).not.toContain(roleBehaviorFor(persona.seat, otherRole));
        }
      }
    }
  });
});
