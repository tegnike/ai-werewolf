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
    expect(systemPrompt).toContain('あなたは天満 ひなた');
    expect(systemPrompt).toContain('内面の矛盾と欠点');
    expect(systemPrompt).toContain('台詞の見本');
    expect(systemPrompt).toContain('一人称は「うち」');
    expect(systemPrompt).toContain('明るい関西弁');
    expect(systemPrompt).toContain('この台詞の最終演技契約');
    expect(systemPrompt).toContain('声とリズム');
    expect(systemPrompt).toContain('公開情報の受け取り方');
    expect(systemPrompt).toContain('禁止する平準化');
    expect(systemPrompt).toContain('台詞直前の事実確認');
    expect(systemPrompt).toContain('この一覧以外の人を「まだ話していない」');
    expect(systemPrompt).toContain('自分自身を自分の名前');
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
    expect(decisionPrompt).toContain('天満 ひなた');
  });

  it('その日の先頭話者に未発生の反応や根拠のない疑いを作らせない', () => {
    const players = setupPlayers('first-opening-speaker');
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-speech-opening-seat-1', seed: 'first-opening-speaker', day: 1,
      phase: 'discussion', kind: 'speech', actor: players[0], players,
      legalTargets: players.slice(1).map((player) => player.seat), publicHistory: [], privateFacts: [], round: 1,
      discussion: {
        version: 'v3', stage: 'opening', turn: 1, spokenSeats: [],
        remainingUnspokenSeats: players.map((player) => player.seat), canRequestReply: true,
        boardDigest: ['今日の貢献数: suspicion=0、defense=0、vote_intent=0、board_analysis=0'],
        agenda: ['公開済みの役職情報、自分がこの発言で公開する能力結果、前日までの発言がなければ、根拠のない疑い先や投票先を無理に作らず、確認したい論点・質問・判断基準を示す'],
      },
    };

    const prompt = buildPrompts(context).systemPrompt;
    expect(prompt).toContain('あなたが今日の最初の発言者です');
    expect(prompt).toContain('今日の沈黙、反応、便乗、返答の遅さ');
    expect(prompt).toContain('仮定、今後の方針、迷い、弱い違和感');
    expect(prompt).toContain('今日あなたに与えられた最初の発言機会');
    expect(prompt).toContain('「遅れた」「待たせた」「返答が遅い」とは扱わない');
    expect(prompt).toContain('主語を「私」や「俺」へ変えて自分の過去行動');
    expect(prompt).toContain('根拠がない場合は疑い先や投票先を無理に作らず');
    expect(prompt).toContain('「なぜそこを見たか」は質問しない');
    expect(prompt).toContain('暫定評価は不要で、structure.suspicion=null、voteIntent=null');
    expect(prompt).not.toContain('自分自身の暫定評価か処刑方針を少なくとも一つ出してください');
  });

  it('discussion v3では既出質問を重ねず疑い・盤面・投票予定を増やすよう促す', () => {
    const players = setupPlayers('discussion-v3-prompt');
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-speech-t8-seat-3', seed: 'discussion-v3-prompt', day: 1,
      phase: 'discussion', kind: 'speech', actor: players[2], players,
      legalTargets: players.filter((player) => player.seat !== players[2].seat).map((player) => player.seat),
      publicHistory: ['神崎 レナ: 私は占い師です。源蔵さんは人狼ではありませんでした。'],
      privateFacts: [], round: 1,
      discussion: {
        version: 'v3', stage: 'opening', turn: 8, spokenSeats: ['seat-5'],
        materialPhase: 'developing',
        remainingUnspokenSeats: players.filter((player) => player.seat !== 'seat-5').map((player) => player.seat),
        canRequestReply: true,
        boardDigest: ['質問済み: inspection_reason=2回（回答1回）', '今日の貢献数: suspicion=1、defense=0、vote_intent=0、board_analysis=0'],
        agenda: ['公開された発言や役職情報を二つ以上比べ、差があるなら暫定候補を示す'],
      },
    };

    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('議論台帳にすでにある質問');
    expect(prompts.systemPrompt).toContain('別々の相手へ「人狼ではない」という結果');
    expect(prompts.systemPrompt).toContain('「白」「黒」「白結果」「黒結果」のように省略しない');
    expect(prompts.systemPrompt).toContain('inspection_reason=2回');
    expect(prompts.systemPrompt).toContain('少なくとも二つの発言・役職情報・候補を比べ');
    expect(prompts.systemPrompt).toContain('structureは実際に口にする内容の自己分類');
    expect(prompts.systemPrompt).toContain('0日目の占い先');
    expect(prompts.systemPrompt).toContain('質問・攻撃・信用比較の材料にしてはいけません');
    expect(prompts.systemPrompt).toContain('今日まだ投票予定を公表していません');
    expect(prompts.systemPrompt).toContain('今日まだ一度も発言していない人');
    expect(prompts.systemPrompt).toContain('この一覧にいない人を「未発言」');
    expect(prompts.systemPrompt).toContain('evidenceDay');
    expect(prompts.decisionPrompt).toContain('structureは本文に現れる');
  });

  it('材料不足では保留を完結貢献として許し、公開済み候補・回答の不存在を主張させない', () => {
    const players = setupPlayers('scarce-and-current');
    const actor = players[1];
    const prompts = buildPrompts({
      matchId: 'test', callKey: 'd1-speech-t3-seat-2', seed: 'scarce-and-current', day: 1,
      phase: 'discussion', kind: 'speech', actor, players,
      legalTargets: players.filter((player) => player.seat !== actor.seat).map((player) => player.seat),
      publicHistory: [], privateFacts: [], round: 1,
      discussion: {
        version: 'v3', stage: 'opening', turn: 3, materialPhase: 'scarce',
        publicCommitments: [{
          seat: 'seat-9', suspicionTargetSeat: 'seat-6', suspicionBasis: 'reasoning_quality', answeredTopics: ['gray_read'],
          defended: true, changedSuspicion: false,
        }],
      },
    });
    expect(prompts.systemPrompt).toContain('疑い先や処刑先は必須ではなく');
    expect(prompts.systemPrompt).toContain('観測できない「様子見」「便乗」「反応の遅さ」');
    expect(prompts.systemPrompt).toContain('まだ候補を出していない');
    expect(prompts.systemPrompt).toContain('根拠をまだ出していない');
    expect(prompts.systemPrompt).toContain('事実に反して述べないでください');
    expect(prompts.systemPrompt).toContain('自分の発言への批判や質問');
    expect(prompts.systemPrompt).toContain('自分が投票先にされていることを別の事実');
    expect(prompts.systemPrompt).toContain('村側として、材料が足りないときの質問');
  });

  it('人狼と狂人へ秘密知識の範囲が異なる任意のブラフを示す', () => {
    const players = setupPlayers('faction-bluffs');
    const base = {
      matchId: 'test', seed: 'faction-bluffs', day: 1, phase: 'discussion' as const,
      kind: 'speech' as const, players, legalTargets: players.map((player) => player.seat),
      publicHistory: [], discussion: { version: 'v3' as const, stage: 'opening' as const, turn: 4, materialPhase: 'scarce' as const },
    };
    const wolf = { ...players[0], role: 'werewolf' as const };
    const wolfPrompt = buildPrompts({
      ...base, callKey: 'wolf', actor: wolf, players: players.map((player) => player.seat === wolf.seat ? wolf : player),
      privateFacts: ['生存中の人狼仲間: 天満 ひなた'],
    }).systemPrompt;
    expect(wolfPrompt).toContain('迷いを見せる');
    expect(wolfPrompt).toContain('人狼仲間と自然に距離を取る');
    expect(wolfPrompt).toContain('仲間の正体を知っていることは漏らさない');

    const madman = { ...players[2], role: 'madman' as const };
    const madmanPrompt = buildPrompts({
      ...base, callKey: 'madman', actor: madman, players: players.map((player) => player.seat === madman.seat ? madman : player),
      privateFacts: [],
    }).systemPrompt;
    expect(madmanPrompt).toContain('狂人として人狼が誰かは知りません');
    expect(madmanPrompt).toContain('候補を競合させる');
  });

  it('人狼判定で議論を固定せず、人狼仲間と狂人に別方向から盤面を揺らさせる', () => {
    const basePlayers = setupPlayers('contested-black-result');
    const wolfActor = { ...basePlayers[0], role: 'werewolf' as const };
    const wolfAlly = { ...basePlayers[1], role: 'werewolf' as const };
    const seerClaimant = { ...basePlayers[2], role: 'seer' as const };
    const madmanActor = { ...basePlayers[3], role: 'madman' as const };
    const players = basePlayers.map((player) =>
      player.seat === wolfActor.seat ? wolfActor
        : player.seat === wolfAlly.seat ? wolfAlly
          : player.seat === seerClaimant.seat ? seerClaimant
            : player.seat === madmanActor.seat ? madmanActor
              : player);
    const candidateEvidence = [{
      targetSeat: wolfAlly.seat, suspicionSpeakers: 1, voteIntentSpeakers: 0,
      suspicionBases: { result: 1 as const }, echoSpeakers: 0, distinctBases: 1,
      claimedResults: [{
        sourceSeat: seerClaimant.seat, claimedRole: 'seer' as const,
        verdict: '人狼' as const, sameRoleClaimants: 1,
      }],
    }];
    const baseContext = {
      matchId: 'test', seed: 'contested-black-result', day: 1,
      phase: 'discussion' as const, kind: 'speech' as const, players,
      legalTargets: players.map((player) => player.seat), publicHistory: [],
      discussion: { version: 'v3' as const, stage: 'opening' as const, turn: 5 },
      candidateEvidence,
    };

    const wolfPrompt = buildPrompts({
      ...baseContext, callKey: 'wolf-reaction', actor: wolfActor,
      privateFacts: ['自分の役職: werewolf', `生存中の人狼仲間: ${wolfAlly.name}`],
    }).systemPrompt;
    expect(wolfPrompt).toContain('対象の本当の役職が確定したわけではありません');
    expect(wolfPrompt).toContain('同じ結果へ便乗するだけで対象を一日中追い詰めず');
    expect(wolfPrompt).toContain(`人狼仲間の${wolfAlly.name}`);
    expect(wolfPrompt).toContain('占い師候補の信用を崩す');
    expect(wolfPrompt).toContain('仲間とだけ応酬せず');

    const madmanPrompt = buildPrompts({
      ...baseContext, callKey: 'madman-reaction', actor: madmanActor,
      privateFacts: ['自分の役職: madman'],
      claimDirective: { mode: 'forbidden', claimedRole: null, results: [], counterTargetSeat: null },
    }).systemPrompt;
    expect(madmanPrompt).toContain('人狼が誰かは知りません');
    expect(madmanPrompt).toContain('傍観や多数派への便乗もせず');
    expect(madmanPrompt).toContain('村の結論が一人へ固定されるのを積極的に崩してください');
  });

  it('集中後は投票予定の人数を証拠にせず公開材料と新情報を比較させる', () => {
    const players = setupPlayers('consensus-evidence-prompt');
    const actor = players[2];
    const context: DecisionContext = {
      matchId: 'test', callKey: 'd1-speech-t12-seat-3', seed: 'consensus-evidence-prompt', day: 1,
      phase: 'discussion', kind: 'speech', actor, players,
      legalTargets: players.filter((player) => player.seat !== actor.seat).map((player) => player.seat),
      publicHistory: ['名取 澪: 私はひよりさんへ投票します。'], privateFacts: [], round: 2,
      discussion: {
        version: 'v3', stage: 'free', turn: 12, consensusTarget: 'seat-9', priorVoteIntentTarget: 'seat-9',
        saturatedPoint: { targetSeat: 'seat-9', basis: 'statement_slip', speakers: 3 },
        boardDigest: ['候補別の公開材料: 久遠 ひより（投票予定3人、疑い2人、根拠result=1、役職結果あり）'],
      },
      candidateEvidence: [{
        targetSeat: 'seat-9', suspicionSpeakers: 2, voteIntentSpeakers: 3,
        suspicionBases: { result: 1, vote_plan: 1 }, echoSpeakers: 0, distinctBases: 2,
        claimedResults: [{ sourceSeat: 'seat-4', claimedRole: 'seer', verdict: '人狼', sameRoleClaimants: 2 }],
      }],
    };

    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('投票予定の人数は他者の意見');
    expect(prompts.systemPrompt).toContain('同じ相手への投票予定を本文で追加宣言せず');
    expect(prompts.systemPrompt).toContain('最終の非公開投票先は拘束されません');
    expect(prompts.systemPrompt).toContain('変更しない予定を本文で繰り返さず');
    expect(prompts.systemPrompt).toContain('「言い間違い・言い回し」という同じ種類の疑い');
    expect(prompts.systemPrompt).toContain('同じ相手を新しい根拠で疑うことは妨げません');
    expect(prompts.decisionPrompt).toContain('candidateEvidence');
  });

  it('合意対象本人の追加反論枠では疑いへの回答と比較候補を要求する', () => {
    const players = setupPlayers('consensus-defense-prompt');
    const prompts = buildPrompts({
      matchId: 'test', callKey: 'd1-speech-t13-seat-1', seed: 'consensus-defense-prompt', day: 1,
      phase: 'discussion', kind: 'speech', actor: players[0], players, legalTargets: ['seat-2'],
      publicHistory: [], privateFacts: [],
      discussion: { version: 'v3', stage: 'free', turn: 13, consensusTarget: 'seat-1', consensusDefense: true },
    });
    expect(prompts.systemPrompt).toContain('投票前に保証された最後の反論枠');
    expect(prompts.systemPrompt).toContain('比較すべき候補と公開根拠');
  });

  it('最終投票でも多数派そのものを根拠にせず証拠台帳を渡す', () => {
    const players = setupPlayers('vote-evidence-prompt');
    const actor = players[0];
    const prompts = buildPrompts({
      matchId: 'test', callKey: 'd1-vote-seat-1', seed: 'vote-evidence-prompt', day: 1,
      phase: 'vote', kind: 'vote', actor, players,
      legalTargets: players.slice(1).map((player) => player.seat), publicHistory: [], privateFacts: [],
      candidateEvidence: [{
        targetSeat: 'seat-9', suspicionSpeakers: 4, voteIntentSpeakers: 5,
        suspicionBases: { result: 1, statement_slip: 3 }, echoSpeakers: 2, distinctBases: 2, claimedResults: [],
      }],
    });

    expect(prompts.systemPrompt).toContain('多数派へ合わせること自体を理由にせず');
    expect(prompts.systemPrompt).toContain('複数人が繰り返した同じ指摘は一つの論点');
    expect(prompts.systemPrompt).toContain('言い間違いや説明の拙さ');
    expect(prompts.systemPrompt).toContain('投票理由で新しく役職を名乗ったり');
    expect(prompts.systemPrompt).toContain('0日目の占い先の選び方は投票判断の材料にしない');
    expect(prompts.systemPrompt).toContain(`${players[8].name}と${players[1].name}`);
    expect(prompts.decisionPrompt).toContain('candidateEvidence');
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
      publicHistory: ['真壁 陽太: 占いCOです。', '福本 源蔵: 霊媒師COです。'],
      privateFacts: ['自分の役職: seer', '福本 源蔵: 人狼'], round: 1,
    };
    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('必ず同じ発言内で「うち、占い師やで」');
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
      claimBoard: ['天満 ひなたは占い師を名乗っています'],
      claimDirective: {
        mode: 'must', claimedRole: 'seer', counterTargetSeat: 'seat-2',
        results: [{ day: 0, targetSeat: 'seat-3', verdict: '人狼' }],
      },
    };
    const prompts = buildPrompts(context);
    expect(prompts.systemPrompt).toContain('判断材料にしてよいのは');
    expect(prompts.systemPrompt).toContain('ゲームで認められた戦術');
    expect(prompts.systemPrompt).toContain('今回は必ず「私は占い師です」と人物らしく名乗り');
    expect(prompts.systemPrompt).toContain('0日目は誰も発言していない');
    expect(prompts.systemPrompt).toContain('占い先を選んだ推理上の理由を作って話してはいけません');
    expect(prompts.systemPrompt).toContain('1日目の夜以降だけに当てはまります');
    expect(prompts.systemPrompt).toContain('人物の口調に合う自然な過去形へ活用');
    expect(prompts.systemPrompt).toContain('「人狼ではない、でした」のように判定語をつなぎ合わせない');
    expect(prompts.decisionPrompt).toContain('authorizedClaim');
    expect(prompts.decisionPrompt).toContain('claimBoard');
    expect(prompts.decisionPrompt).not.toContain('本物');
    expect(prompts.decisionPrompt).not.toContain('偽物');
  });

  it('役職主張の固定文も人格ごとの一人称へ統一する', () => {
    const players = setupPlayers('claim-first-person');
    const actor = { ...players[6], role: 'werewolf' as const };
    const prompts = buildPrompts({
      matchId: 'test', callKey: 'd1-wolf-fake-seer', seed: 'claim-first-person', day: 1,
      phase: 'discussion', kind: 'speech', actor,
      players: players.map((player) => player.seat === actor.seat ? actor : player),
      legalTargets: [], publicHistory: [], privateFacts: ['自分の役職: werewolf'], round: 1,
      discussion: { version: 'v3', stage: 'opening', turn: 2 },
      claimDirective: {
        mode: 'must', claimedRole: 'seer', counterTargetSeat: null,
        results: [{ day: 0, targetSeat: 'seat-2', verdict: '人狼ではない' }],
      },
    });
    expect(prompts.systemPrompt).toContain('今回は必ず「俺が占い師だ」と人物らしく名乗り');
    expect(prompts.systemPrompt).not.toContain('今回は必ず「私は占い師です」と人物らしく名乗り');
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
      speech: 'ひなたさんの便乗が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-2', basis: 'interaction', echoSourceSeat: null, evidenceDay: 1 }, voteIntent: null, boardAnalysis: false,
      },
    }).success).toBe(true);
    expect(schema.safeParse({
      speech: 'ひなたさんの便乗が気になります。', addressedTo: null, requestsReply: false,
      structure: {
        primaryAct: 'suspicion', questionTopic: null,
        suspicion: { targetSeat: 'seat-2', basis: 'interaction', echoSourceSeat: null }, voteIntent: null, boardAnalysis: false,
      },
    }).success).toBe(false);
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

    const consensusSchema = speechDecisionSchema(['seat-2'], false, true, ['seat-1', 'seat-2'], [], ['seat-1']);
    expect(consensusSchema.safeParse({
      speech: '澪さんに投票します。', addressedTo: null, requestsReply: false,
      structure: { primaryAct: 'vote_intent', questionTopic: null, suspicion: null, voteIntent: 'seat-1', boardAnalysis: false },
    }).success).toBe(false);
    expect(consensusSchema.safeParse({
      speech: 'ひなたさんに投票します。', addressedTo: null, requestsReply: false,
      structure: { primaryAct: 'vote_intent', questionTopic: null, suspicion: null, voteIntent: 'seat-2', boardAnalysis: false },
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
