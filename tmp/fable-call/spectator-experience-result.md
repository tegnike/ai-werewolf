# AI人狼 観客体験の改善案と実装優先順位

- Model: `claude-fable-5`
- Generated: `2026-07-16T19:48:52Z`
- Working directory: `/Users/user/WorkSpace/ai-werewolf`
- Prompt source: `/Users/user/WorkSpace/ai-werewolf/tmp/fable-call/spectator-experience-prompt.md`
- Effort: `max`

## Prompt sent to Fable

# Fable consultation request

## Role

Act as a read-only advisory subagent. Do not edit files or run commands. Inspect only the explicitly named repository files and screenshot as needed.

## Objective

Evaluate the currently implemented AI Werewolf game as a spectator product, propose concrete improvements, and rank them in the order they should be implemented.

The two primary evaluation questions are:

1. Because nine AI players run the game automatically, can a first-time viewer easily understand what is happening, why it matters, and what changed?
2. Does the presentation make the things viewers seek from a standard Werewolf game enjoyable: deduction, suspicion, lies, role claims and counterclaims, interpersonal reactions, voting tension, night secrets, reversals, deaths, and the final role reveal?

## Why Fable

This needs independent product judgment, information-design critique, and entertainment-direction judgment across UI, event presentation, pacing, and existing game behavior. Codex will retain responsibility for implementation and verification after receiving the advice.

## Known facts and constraints

Confirmed facts:

- This is a desktop-only, self-hosted Next.js application in which nine fixed AI agents autonomously play a standard nine-player Werewolf game.
- Roles are three villagers, two werewolves, one seer, one medium, one bodyguard, and one madman.
- The human viewer can start, pause, resume, abort, watch live, switch public/GM viewpoints, and replay saved event streams.
- Public and secret information are separated server-side. Do not recommend weakening this boundary.
- Live speech can be read by nine distinct VOICEVOX voices, synchronized with the displayed speech. Original ambient BGM is present.
- The current viewer has a 3x3 player-card board, latest speech per player, life/role badges, a right-side reverse-chronological event log, vote tally bars, phase header, result banner, and replay controls.
- Current screen at the end of a replay: `tmp/fable-call/current-view.png` (1440x900).
- Development, tests, CI, UI checks, and repeated simulations must use MockAI only.
- Real AI is reserved for one final acceptance match under a double opt-in gate. Do not recommend iterative real-AI testing.
- OpenAI production model and effort are fixed. Do not recommend changing model or adding fallback models.
- The standard rules, role names, and lack of a custom story/world are fixed. Do not propose new roles, altered win conditions, viewer participation, chat, mobile design, accounts, rankings, or unrelated scope.
- Secret roles must not appear in public view before the match ends.
- Repository is currently clean apart from consultation artifacts under `tmp/fable-call/`. No push is allowed.

Assumptions to challenge if needed:

- The current screen may be visually polished while still under-explaining causal relationships.
- Improvements may involve derived presentation computed from existing events, small new public events, prompt/narration changes, or larger features, but should preserve deterministic rules and information boundaries.

## Relevant context

Use these exact files:

- `docs/implementation-plan.md` — authoritative product, rule, UI, and security specification; especially sections 0, 3, 4, 5, and 8.
- `docs/acceptance-report.md` — current validation status.
- `README.md` — implemented features and operation.
- `src/ui/MatchViewer.tsx` — main live/replay spectator UI and event formatting.
- `src/ui/presentation.ts` — speech/VOICE presentation gating.
- `src/ui/HomeScreen.tsx` — match launch and archive.
- `src/app/globals.css` — full current visual design.
- `src/engine/game.ts` — actual game loop and emitted event payloads.
- `src/server/view.ts` — public/GM projection boundary.
- `src/server/ai/prompts.ts` — AI discussion/decision prompts and available narrative behavior.
- `src/server/ai/mock.ts` — deterministic development behavior.
- `test/e2e/app.spec.ts` and `test/unit/presentation.test.ts` — current observable coverage.
- `tmp/fable-call/current-view.png` — current rendered replay screen.

## Questions

1. What are the most important spectator-comprehension problems in the current implementation, and what concrete change solves each one?
2. What is missing or under-emphasized in expressing the fun viewers expect from Werewolf, and what concrete presentation or behavior change would improve it without changing the standard rules?
3. Rank all recommended improvements in implementation order using both expected spectator impact and implementation ease. Explicitly distinguish quick wins from medium and large work.
4. For each recommendation, identify the likely files/components, event data needed, public-vs-GM behavior, acceptance criteria, and key risk.
5. Which coherent subset should Codex implement immediately in this session for the best impact-to-effort ratio? Include exact sequencing and indicate which items should deliberately wait.

## Required response

- Lead with a concise assessment of the current product.
- Provide one ranked table with: rank, recommendation, viewer problem solved, expected effect (1-5), implementation ease (1-5 where 5 is easiest), why this rank, and estimated scope.
- Make recommendations implementation-ready, not generic. Cite repository file paths and line numbers when possible.
- Explicitly cover both public view and GM view and never leak secrets into public view.
- Explicitly identify how the recommendation makes a standard Werewolf match more understandable or more entertaining.
- End with an immediate implementation batch small enough for one coding session, ordered step-by-step, plus deferred items.
- Explain key reasoning and trade-offs.
- Identify assumptions, risks, and missing evidence.

## Fable response

**魔理沙**: なるほど、ダイアログは不要ってことだな。りょうかいだぜ。じゃあコンサル回答の完全版をここに直接納品するぜ。詳細版はプランファイル(`~/.claude/plans/fable-consultation-request-replicated-snail.md`)にも保存済みだ。

---

# AI人狼 観戦プロダクト診断 — Fableコンサル最終回答

## 総合評価

**霊夢**: 土台は堅牢で高品質よ。エンジンの決定論、サーバー側情報分離、イベントソーシング、リプレイ、VOICEVOX同期、人格プロンプト——受け入れ試験も全部通ってる。でも観戦プロダクトとして見ると、**ゲームの因果と山場が「データには存在するのに画面に出ていない」**の。問題は情報の生成ではなく提示。だから改善の大半はエンジン非接触の導出表示とUI演出で済むわ。本体調査と、同じファイル群だけを読ませた独立批評エージェントの二重調査で、トップ所見は完全に一致したわよ。

**魔理沙**: 象徴的な三大発見だぜ。

1. **記名投票が捨てられている**。公開イベント `vote_reveal` のpayloadには `votes`(誰が誰へ+statedReason)が入っていて(`src/engine/game.ts:171`)、AIプレイヤーには「澪→レナ, …」と記名で渡している(`game.ts:172`)。なのにUIはログ(`src/ui/MatchViewer.tsx:28`)もパネル(`:152`)も得票集計のみ。**観客がAIプレイヤーより情報弱者**なんだぜ。しかもGM専用のはずの `statedReason` が公開payloadへ素通し(`src/server/view.ts:12-15` がpayload無加工。仕様5.1逸脱)。
2. **公開視点には夜が存在しない**。夜イベントは全部private(`game.ts:203-258`)で、フェーズ・背景・BGMムードは最後に見えたイベントから導出(`MatchViewer.tsx:48-49,117-119`)。公開視点は夜にならず、実AIの夜処理(直列8〜12回のAPI呼び出し)の間は「固まった」ように見える。
3. **仕様5.1「終了後は全て公開○」が未実装**。`view.ts:7-16` は試合状態を見ない。試合が終わっても「護衛成功だった」「人狼の相談」という**答え合わせ=観戦のクライマックス**が公開視点に来ない。終了画面は勝利バナー+役職バッジのみ(スクリーンショット確認)。

**Q1(初見が追えるか)**: 部分的にしか追えない。発言は追えるが、投票の因果、夜の存在、あと何人で投票かの進行感、死の記録(いつ・どう死んだか)、生存数と勝利距離、終了後の種明かしが不足。ログは全イベント同一見た目で日区切りもない。
**Q2(人狼の楽しさ)**: 疑い・嘘・対人反応は発言と声で既に出ている。投票の緊張、夜の気配、死の衝撃、最終ネタバラシ、CO/対抗COの構図は**データはあるのに可視化・演出がない**。

## 推奨改善ランキング(Rank順=実装推奨順)

| Rank | 施策 | 解決する観客の問題 | 効果 | 容易さ | このランクの理由 | 規模 |
|---|---|---|---:|---:|---|---|
| 1 | 公開payloadホワイトリスト化(statedReason送出停止) | 仕様5.1違反の潜在漏洩、将来の誤描画事故 | 2 | 4 | 30分級の衛生修正。Rank2・3と同じファイル/テストなので先頭 | S / quick win |
| 2 | 終了後の全公開ゲート(view.ts+leakテスト両方向) | 「答え合わせ」が公開視点に存在しない(仕様5.1未実装) | 5 | 4 | 効果最大級。唯一境界コードに触るのでセッション冒頭に | S〜M / quick win |
| 3 | 記名投票の完全可視化(パネル記名・ログ記名・日付・カード投票履歴) | 「誰が誰を吊りに行ったか」が見えない。前日パネルが今日に見える | 5 | 5 | 既存公開payloadの描画のみの本命。アニメはRank10へ分離 | M / quick win |
| 4 | GM視点イベント整形(vote_cast/decision_note/statedReason表示) | GM席なのに投票理由・襲撃最終決定・人狼確認が中身のない行 | 3 | 5 | Rank3と同じ `eventText` 編集パス | S / quick win |
| 5 | 死亡記録+生存カウンタ(「2日目処刑」「生存6/9」、GMのみ人狼残数) | 死の記録が消え、勝利までの距離の算数的緊張がない | 4 | 5 | 既存イベント導出のみ | S / quick win |
| 6 | ログのビート階層+日区切り | 処刑・開票が発言と同見た目で埋没、日境界なし | 4 | 4 | `className={event.type}` 既存でほぼCSS | S / quick win |
| 7 | 導出フェーズ/夜ムード(公開視点の夜・第0夜・投票中) | 公開視点で夜が存在しない | 4 | 4 | エンジン無変更、保存済み試合にも即効 | S〜M / quick win |
| 8 | ミニエピローグ(陣営別役職一覧+運命+狂人の勝敗明記) | 終幕が薄いバナー1本 | 4 | 4 | `match_finished.roles`+Rank5の再利用で安い | S / stretch |
| 9 | 観戦画面ルール/役職ガイド | 初見が役職・昼夜・勝利条件を知らない | 3 | 5 | 静的。余り時間で | S / stretch |
| 10 | ビート演出(開票1票ずつ・処刑/襲撃/決着スティンガー・dwell機構) | 開票と死が一瞬で流れ緊張の山が立たない | 4 | 3 | タイマー×SSE×音声調停は事故りやすく専用で | M / medium |
| 11 | `night_falls` 公開ナレーションイベント(正本化) | Rank7の導出を保存イベントとして正本化(仕様7.8「GM固定文選択」) | 4 | 3 | イベント列が変わり再検証一式が必要 | M / medium |
| 12 | リプレイ操作(フェーズ/日ジャンプ・速度・種別別dwell・日マーカー) | 一律700msで発言が読めない。仕様5.2「前後フェーズ」「速度」欠落 | 4 | 3 | リプレイ=鑑賞モード化の中核。Rank10とdwell共用 | M / medium |
| 13 | フルエピローグ(夜ごとの真相年表) | 種明かしを物語として読ませる仕上げ | 4 | 4 | Rank2+8の上に載せるだけ | M / medium |
| 14 | 投票履歴マトリクス(9人×日) | 日横断の投票パターンが読めない | 3 | 4 | Rank3のカード履歴で大半足りるため後回し | S〜M / medium |
| 15 | CO・結果報告の構造化+役職主張ボード | CO/対抗COの構図が自由文に埋没。MockAIはCOせずデモ不能 | 5 | 2 | 効果最大級だがschema+prompt+engine+mock+UI横断。専用設計で | L / large |
| 16 | GMナレーター音声(10人目のVOICEVOX話者) | GMビートが無音ログで「ログスパム」に感じる | 4 | 2 | 音声系ファイルが調査範囲外+話者権利確認 | L / large |
| 17 | リプレイの音声読み上げ(要調査) | 貴重な実AI試合を声つきで再鑑賞できない(無音の可能性大) | 4 | 2 | `useMatchVoice.ts` 未読。調査先行 | L / large |
| 18 | ライブ中の速度変更(仕様5.2) | 見せ場だけゆっくり見る操作がない | 3 | 3 | control API+Runner(範囲外)接触 | M / medium |
| 19 | ホーム一覧に日数(仕様5.2) | リプレイ選びで試合の長さが分からない | 2 | 4 | 一覧API小改修。相乗りで | S / medium |

## 主要項目の実装要点(ファイル・データ・公開/GM・受け入れ・リスク)

**霊夢**: 全19件の完全詳細はプランファイルにあるわ。ここでは判断に効く要点だけ書くわよ。

- **Rank 1**: `src/server/view.ts:12-15` にイベント種別ごとのpayload射影を追加(`vote_reveal`→`{round, votes:[{voter,target}], tally}`)。受け入れ=leakテストに「公開payloadに `statedReason` なし」追加。リスク=フィールド落とし→公開UIの参照フィールドをテストで固定。
- **Rank 2**: `projectEvents(events, view, matchTerminal)` 化。終端(`finished`/`aborted`/`aborted_budget`)なら公開にも全イベント(visibility付き)。snapshot GETのみで、SSEは無変更(終端後は新イベントが来ないし、クライアントは2秒ポーリングで再取得する `MatchViewer.tsx:83`)。UIは `MatchViewer.tsx:154` の `view==='gm'` 条件を `event.visibility==='private'` に変更。**終了「前」の分離は1バイトも変えない=境界の弱体化ではなく仕様準拠**。受け入れ=leakテスト両方向(進行中はprivateゼロ/終了後は `seer_result` 等が公開viewに**ある**)。ポリシー判断1件: aborted試合も公開する(推奨)。
- **Rank 3**: パネル(`MatchViewer.tsx:152`)を被投票者ごとの記名チップ化、バー幅正規化(現行 `count*24%` は5票で100%超のバグ)、見出しに「N日目の投票結果」+翌日は減光(現行 `:129` は最新を日付なしで出し続ける)、ログ(`:28`)を「レナ ← 澪・剛・ひより(3票)」形式、決選は接頭辞、各カードにD別投票履歴チップ。GMのみstatedReasonサブテキスト。
- **Rank 4**: `eventText`(`MatchViewer.tsx:23-35`)に分岐追加 — `vote_cast`「澪 → レナ『理由』」(現在は `eventLabel` にすらキーがなく中身なし表示)、`decision_note`「襲撃の最終決定: 剛 → さくら『理由』」、`werewolf_reveal` 狼名列挙、`night_resolved` 護衛一致時「護衛成功!」。
- **Rank 5**: `execution`/`dawn` から `{day, cause}` 導出→死亡カードに表示、ヘッダーに「生存 6/9」。GM人狼残数はGM専用payload(`match_created`)由来なので漏洩なし。襲撃死は「N+1日目朝 犠牲」表記で統一。
- **Rank 7**: `derivePresentedPhase()` を `src/ui/presentation.ts` に追加(最後の公開イベントが `execution` かつ未終了→夜/day0でイベント0件→第0夜/当日発言数=生存×2かつ開票未着→投票中)。`isNight`・`audioMood`・scene-headingへ接続。`test/unit/presentation.test.ts` の純関数パターンでテスト。
- **Rank 11**: `game.ts:200-201`(処刑後勝敗判定)直後に公開 `night_falls {day, text}`。文言は `narration.ts`+`rand(seed, purposeKey)` で決定論選択、「常に起こる事実」のみで役職の生存を示唆しない。同seed基準列の再生成が必要。旧試合は `view.ts:9-10` の後方互換の前例に倣いRank7導出でフォールバック。
- **Rank 15**: `SpeechDecision` に任意 `claimRole`/`report{targetSeat, verdict}`(**発話行為の自己申告であって真実ではない**——狂人の騙りCOは `claimRole:'seer'` になる。公開情報のみで漏洩なし)。真役職からは絶対に生成しない。MockAI(`mock.ts`)へ「真占い師がD1にCO+実結果報告、seed依存で狂人対抗CO」の決定論脚本を追加(これがないとデモもE2Eも不能)。UIは主張チップ+主張ボード、GM/終了後は真役職と突き合わせて偽COマーク。リスク=実AIの本文と注釈の食い違い(最終受け入れまで検証不能)→本文を常に正、注釈は「主張」として弱く表示。

## 今セッションの実装バッチ(Codexへの指示)

**魔理沙**: エンジンのイベント生成に一切触れないから、`同seed→同payload列` の決定論もsim検証も無傷の構成だぜ。1〜7が必須、8〜9はstretchだ。

1. **Rank 1** ホワイトリスト射影+leakテスト追加
2. **Rank 2** 終端全公開ゲート+leakテスト両方向化(境界を触る作業は集中力のある序盤に、1とセットで)
3. **Rank 3** 記名投票の完全可視化
4. **Rank 4** GMイベント整形(3と同じ編集パスで続けて)
5. **Rank 5** 死亡記録+生存カウンタ
6. **Rank 6** ログのビート階層+日区切り
7. **Rank 7** 導出フェーズ/夜ムード
8. *(stretch)* **Rank 8** ミニエピローグ → 9. *(stretch)* **Rank 9** ルールガイド

**意図的に待たせるもの**: Rank10(タイマー×SSE×音声の調停は最も事故りやすい——静的表示を先に確実に)、Rank11(再ゴールデン化が必要)、Rank15(横断規模+実AI検証不能、専用セッションで)、Rank12・16・17(音声系は `useMatchVoice.ts` の調査先行、まとめて「鑑賞モード」セッションに)、Rank13・14(それぞれ2と3の上に安く積める)、Rank18・19(快適性系、相乗りで)。

検証: `lint/typecheck/test`(leak両方向含む)→ `test:e2e`(記名投票・夜ムード・終了後public公開のアサート追加)→ `sim 30試合`(イベント列不変・API 0)→ ブラウザ目視は**既存の実AI保存試合のリプレイ**で(導出系が過去データに効く最良の実地検証)。実AI再実行はしない。

## 前提・リスク・証拠の欠落

- 指示どおり `useMatchVoice.ts`・`runner.ts`・`repo.ts`・`test/leak/`・`schemas.ts` 等は未読。リプレイ無音の推定(Rank17)、leakテストの現形、Rank18の工数は推定を含む——実装時に現物を先に確認すること。
- MockAIの発言は状況非依存の定型でCOも記名投票との因果も再現されない。**開発中に確認できる「面白さ」の上限はMockAIの脚本の質で決まる**ため、Rank15のMock拡張は演出検証インフラとしても価値がある。実AIの会話品質は制約上、次の実AI試合まで測定不能。
- スクリーンショットは終了画面のみ・低解像度で、ライブのテンポ感は未観測。演出の時間パラメータは実機微調整前提。
- ポリシー判断は1件だけ: aborted試合を終端全公開に含めるか(推奨: 含める)。

**霊夢**: 以上で診断完了よ。要するに「**素材は一級品、あとは盛り付け**」——射影2件を正しくして、既に持っているデータを見せるだけで、観戦体験は今セッション中に別物になるわ。ゆっくり実装していってね!
