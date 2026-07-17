# AI人狼 役職CO・騙り戦術システム設計

- Model: `claude-fable-5`
- Generated: `2026-07-17T07:19:22Z`
- Working directory: `/Users/user/WorkSpace/ai-werewolf`
- Prompt source: `/Users/user/WorkSpace/ai-werewolf/tmp/fable-call/role-claim-strategy-prompt.md`
- Effort: `max`

## Prompt sent to Fable

# Fable consultation request

## Role

Act as a read-only advisory subagent. Do not edit files or run commands. You may inspect the named repository files available in the working directory, but return only an implementation plan and critique.

## Objective

Design an implementation-ready, backward-compatible strategy system for a standard Japanese 9-player werewolf game so that true-role CO timing, madman/werewolf counterclaims and concealment, false divination/medium results, claim consistency, speaking opportunities, public projection, persistence, and evaluation work together naturally without making a new deterministic tell.

The concrete defect is that after replacing two fixed speech rounds with an opening round plus dynamic free discussion, the true seer nearly always explicitly claims while madmen and werewolves almost never counterclaim. Experienced spectators can therefore treat the lone seer claim as almost confirmed truth.

## Why Fable

This needs independent architectural and game-design judgment across hidden information, probabilistic tactics, prompt contracts, deterministic replay, API budgets, backward compatibility, and spectator clarity. Codex will verify and adapt the advice against the repository before implementation.

## Known facts and constraints

### Confirmed facts

- Repository: `/Users/user/WorkSpace/ai-werewolf`; branch `main`; current HEAD `28232b4`; worktree is clean at consultation time.
- `docs/implementation-plan.md` is the source of truth.
- This is ordinary 9-player werewolf only: villager 3, werewolf 2, seer 1, medium 1, bodyguard 1, madman 1. Do not invent roles, lore, or bespoke rules.
- Opening discussion gives every survivor one deterministic rotating-order speech. Free discussion then has at most survivor-count additional speeches; each player gets at most two; at most two intent polls per day with four candidates each. Addressed replies are prioritized. Total public speeches are at most twice survivor count.
- Speech currently returns `speech`, `addressedTo`, and `requestsReply`. Intent returns `urgency`, `motivation`, and `targetSeat`.
- Existing role-policy prose encourages madman deception, but there is no durable claim ledger or private deception plan. `src/server/ai/disclosure.ts` requires an explicit Japanese role claim when a seer/medium result is disclosed. The general prompt's private-facts restriction may discourage strategic false assertions.
- Claims currently live only in free-form public speech. Public view filtering must never prove whether a claim or result is true.
- The engine is event-sourced through SQLite events, supports replay/resume/idempotent AI calls, and must remain compatible with old saved matches/events.
- Development, automated tests, CI, E2E, and repeated simulations must use MockAI only.
- Real AI is allowed only at final acceptance with both explicit `--ai real` and `ALLOW_REAL_AI=1`. Production model is fixed to `gpt-5.6-luna`, `reasoning.effort='low'`, with no model fallback.
- Do not use `Math.random()` in `src/`; stochastic behavior must be deterministic from the match seed.
- Secrets remain server-side. Never log API keys, prompts, AI response bodies, or secret roles.
- Physical AI calls abort before 240. Current intent/speech call budgets should not grow materially.
- If an AI decision is invalid, repair/retry must be bounded and must not substitute random gameplay or another model.
- Madman does not know werewolf identities and must be able to accidentally blacken a wolf or white-cover one.
- A local server is currently listening on port 3001, but runtime state is outside this advisory task.

### Scope

- True seer and true medium CO timing.
- Madman and situational werewolf seer/medium deception, including concealment.
- Public structured claims separated from private truth/belief.
- Durable public claim ledger plus private deception plan or an alternative durable representation.
- Counterclaim opportunity in the dynamic speaker scheduler without broad repolling.
- Event schema, AI schemas/prompts, MockAI, engine, persistence/replay, public view, UI, and metrics/tests.
- Safe migration/defaulting for old event streams and interrupted matches.

### Non-goals

- Changing role composition or fundamental game rules.
- Optimizing win rates with real-AI batch experiments.
- Introducing free-form chain-of-thought or logging hidden rationale.
- Making every madman or werewolf claim, or simply lowering true-seer CO frequency in isolation.

## Relevant context

Inspect these files as needed:

- `docs/implementation-plan.md` sections 3.5, 3.9, 3.10, 4, 7.5-7.7, 8.5-8.6, 10-11
- `docs/spectator-experience-backlog.md` section 8
- `src/domain/types.ts`
- `src/domain/events.ts`
- `src/domain/role-behaviors.ts`
- `src/engine/game.ts`
- `src/engine/state.ts`
- `src/engine/prng.ts`
- `src/server/ai/schemas.ts`
- `src/server/ai/prompts.ts`
- `src/server/ai/disclosure.ts`
- `src/server/ai/client.ts`
- `src/server/ai/mock.ts`
- `src/server/db.ts`
- `src/server/repo.ts`
- `src/server/runner.ts`
- `src/server/view.ts`
- `src/ui/MatchViewer.tsx`
- `src/ui/types.ts`
- `test/` and `package.json`

Existing relevant commits are `73a0188` (dynamic free discussion) and `28232b4` (force MockAI in Playwright).

## Questions

1. What decision model yields natural but non-monotonic CO/counterclaim/concealment behavior in ordinary 9-player werewolf? Distinguish true seer, true medium, madman, and two werewolves across day, result type, existing claims, execution pressure, attack risk, credibility, partner state, and personality.
2. Which parts should be deterministic validation/policy, seeded probability, and structured AI judgment? Explain why, and avoid probabilities that become a new easily learned tell.
3. What is the smallest backward-compatible domain model that cleanly separates private truth, private tactical intention, public assertion, and derived public claim ledger? Specify concrete TypeScript shapes and ownership/visibility.
4. Should private deception state be an event, derived state, a separate table, or AI-call output? Explain persistence, resume, replay, idempotency, information-boundary, and old-match implications.
5. Define a structured speech/claim contract for CO, counterclaim, result report, correction, retraction, and optional slide if you recommend it. How should text/schema disagreement be handled without accepting impossible claims or leaking truth?
6. How should false result targets and values be created and kept consistent across days? Define validation for dead/alive timing, self-targeting, repeated targets/results, medium eligibility, future knowledge, and deliberate correction/retraction.
7. How can the current speaker scheduler guarantee a timely counterclaim/correction opportunity while preserving current daily speech and intent-poll ceilings and avoiding an all-player repoll after every claim?
8. How should prompts reconcile `use only public information and private facts` with authorized strategic lying? Provide precise prompt-contract principles, not merely flavor prose. Keep private rationale short and structured.
9. What exact event additions or payload extensions, reducer/state changes, public projection rules, UI presentation, and replay behavior are needed? The UI must show only `this character claimed X`, never truth confirmation.
10. What bounded validation/repair/retry behavior is safest when structured claim output is invalid, text contradicts annotations, or a model proposes an impossible result? No model fallback and no secret-bearing logs.
11. How should MockAI deterministically reproduce at least these lanes: lone true-seer claim, madman counterclaim, werewolf counterclaim, all deceptive roles concealed, accidental madman wolf-black/white-cover, durable multi-day false history, counterclaim priority, and invalid claim rejection/repair?
12. Propose measurable acceptance targets and a multi-seed Mock simulation report for true-seer day-1 CO, counterclaim, apparently-confirmed lone claim, role/day distribution, contradiction/impossible-claim rate, completion, and daily call/speech budgets. Explain which distribution metrics are meaningful with scripted MockAI versus reserved for a tiny real-AI sample.
13. Give an incremental implementation order that minimizes schema/replay risk, including exact files and test layers. Identify recommendations that should be rejected or deferred if they add too much complexity for this codebase.
14. Identify the highest-risk hidden-information leaks, game-design failure modes, and migration traps in this change.

## Required response

- Lead with the recommended architecture and decision model.
- Give concrete TypeScript data shapes, events, validators, scheduler changes, prompt contracts, and persistence/replay rules.
- Separate must-have MVP work from later refinements.
- Include a file-by-file implementation sequence and test matrix.
- Include suggested numerical acceptance ranges, while clearly labeling assumptions and what MockAI cannot validate.
- Explain key reasoning and trade-offs.
- Identify assumptions, risks, missing evidence, and recommendations to reject or defer.
- Cite repository file paths and line numbers when possible.
- Do not edit files or run commands.

## Fable response

霊夢「承認ダイアログはキャンセルされたみたいね。これは読み取り専用のコンサル依頼で、成果物は計画書そのものだから、最終回答を本文でまとめて渡すわよ。完全版は `/Users/user/.claude/plans/fable-consultation-request-lovely-umbrella.md` に保存済みよ」

---

# コンサル回答: 役職CO・対抗・騙り戦略システム設計

## 推奨アーキテクチャ（結論）

魔理沙「合言葉は**『導出せよ、永続化するな』『新イベント型ゼロ』『真も偽も同じ扉を通す』**だぜ」

1. **ClaimPolicy は全9人分をシードから純粋導出**（永続化しない）。`(matchSeed, players)` → stance/騙り役職/COスロット/リアクティブトリガ。偽の占い・霊媒結果も夜ごとに純粋導出。追加AIコール **0**、新イベント **0**。
2. **公開契約は `discussion_speech` payload の `claim` ブロック拡張のみ**。公開 ClaimLedger はそこから fold。`match_created` payload に `rules:{claims:'v1'}` マーカーを足すだけで後方互換ゲートが成立（`runner.ts:117` の `includeDayOneDawn` と同パターン）。
3. **エンベロープ方式**: エンジンが発言前に「今、公に主張してよい/すべき正確な内容」(ClaimDirective: `must`/`may`/`forbidden` + 認可済み結果リスト)を真偽対称に注入。検証は「claim ⊆ エンベロープ + 公開情報のみの妥当性」で、**真の役職を決して参照しない**。
4. **対抗機会は pull 型スキャン**: 台帳に主張が載ったら、`mode==='must'` の生存者を `nextSpeaker` に直接注入（既存 `requestsReply` 連鎖 `game.ts:290-297` と同機構）。再ポーリングなし、天井不変、キュー状態なし（毎スロット再計算するので resume 安全・翌朝繰越が自動）。
5. **根本原因のプロンプト契約を分離**: `prompts.ts:38`（情報衛生=知ってよいもの）と `prompts.ts:58`（主張の誠実性=言ってよいもの）を書き分け、エンベロープ実行を明示授権。文言テンプレは真偽で完全同一。

## 決定モデル（Q1・Q2）

霊夢「三層分離よ。**決定的**=資格・天井・期限・エンベロープ包含・公開妥当性。**シード確率**=stance混合・スロット抽選・リアクティブ抽選・偽結果内容（effort=lowのモデルに分布再現は期待できない——それが今回のdefectの実証）。**AI判断**=`may` 時の言う/見送る・文言・宛先」

主要パラメータ（チューナブル事前分布、v1で凍結）: 真占い=d1朝一巡0.55/d1自由0.25/d2朝0.12/リアクティブ0.08、**d2朝must期限**。真霊媒=d2朝0.70中心、d3期限。狂人=fake 0.65（seer 0.77/medium 0.23）/潜伏0.35+遅対抗裾0.06/日。指名狼（シードで2匹から1匹）=fake 0.30、被黒緊急対抗0.35。テル化防止: 全分岐に裾確率（[0.05,0.95]クランプ）、**真偽で同一のCOタイミングテーブル**、先出しフラグは意図的に保持（削ると「最初の名乗り=真」という新テルが生まれる）。

## 私的状態の置き場所（Q4）と重大な但し書き

イベント化は**却下**——公開ビューが `seq` を露出しており（`view.ts:40`）、スタンス保有者だけ私的イベントが増えるとギャップ解析で漏れる。別テーブルも AI コール出力も却下。ただし**導出コードはリプレイ契約の一部になる**（blocker級）: `CLAIM_PARAMS` 変更は進行中claims試合の resume を `RecoveryDivergenceError`（`runner.ts:24-28`）で恒久破壊するため、バージョンマーカー+導出モジュール凍結+運用runbookが必須。

## 検証・修復（Q5・Q6・Q10）

C1〜C9 の規則表（計画書§4.2）。要点: 文→構造の照合は**一人称の名乗り正準句に限定**（既存 `resultLikeClaim` 流用は「Xは人狼だ」を誤爆する）。同夜襲撃犠牲者への占い・同一対象の別日再占いは真で合法だから偽にも許す。偽霊媒と真霊媒の矛盾は正常な人狼であり修正しない。修復は検証リトライ≤2（既存5試行の内数）→ claim剥離 → 必要時のみ `……（沈黙）` → **フォールバックを `ok` キャッシュ**（怠ると resume で再コール分岐）。フィールド名は `claimedRole`（`"role":` リークテスト回避）。

## MockAI・受け入れ（Q11・Q12）

MockAI はエンベロープに従順な実行者にし、8レーンは fixture シードで再現。不正クレームレーンの Mock 実装は**却下**——検証は `RealAI.speech` 内（`client.ts:42`）にのみ配線され Mock は通らないため、fake トランスポート注入テストで代替。Mock 200シードのハード基準: 完走100%・apiCalls 0・不可能主張0・決定性100%。ソフト: 真占いd1 CO 0.80±0.08、対抗率0.55±0.10、単独無対抗0.20–0.40。**Mockで検証不能なもの**=実AIが偽エンベロープに従うか（最大の未知数）。受け入れゲート: 偽レーン遵守率≥0.8、スタンス別沈黙率差≤0.10（沈黙フォールバック経由の defect 再発を検出する装置）。

## 実装順序（Q13）

`domain/claims.ts` → `engine/claim-policy.ts` → 型/スキーマ → `game.ts` 統合（**options.claims デフォルト false**、既存テスト無改変） → `mock.ts` → `disclosure/prompts/client/role-behaviors/log` → `view/UI`（apiCalls を進行中GM化——修復回数サイドチャネル対策） → `sim/docs`。各ステップ単独グリーン。撤回/訂正/スライドCO/身内切り/狩人COは v2 送り。

魔理沙「詳細な型定義・パラメータ表・C1-C9全文・リスク登録簿17件の裁定・テストマトリクスは計画書ファイルに全部入ってるぜ。Codex側はまず R1（導出凍結）・R2（正規表現誤爆）・R3（`claimedRole`命名）の3つの blocker 対策から検証するのがおすすめだ」

