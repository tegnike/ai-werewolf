# AI人狼 Webアプリ 完全実装計画書

作成日: 2026-07-16  
実装先: `/Users/user/WorkSpace/ai-werewolf`  
用途: 別のCodexセッションが、追加の企画判断なしで実装・検証するための正本

## 0. 最重要方針

これは**一般的な人狼ゲームをAI同士にプレイさせるアプリ**である。独自ゲームへ改変しない。

- ゲーム名は画面上もREADME上も、単に `AI人狼` / `AI Werewolf` とする。
- 役職名は一般的な `村人・人狼・占い師・霊媒師・狩人・狂人` をそのまま使う。
- 人狼、村人、占い師などを別の固有名詞へ言い換えない。
- 独自の世界観、物語、職業設定、キャラクター設定を付けない。
- AIは9人の固定名と個別人格を持つプレイヤーとして参加する。ただし独自役職・物語・世界観は付けない。
- 一般的な9人人狼のルールを採用し、ルール文、コード、画像、UIは独自制作する。

本書は、Fableが提案した観戦UXと堅牢な技術構成を、マスターの訂正に従って**標準人狼へ全面的に戻した修正版**である。以前の独自タイトル・独自役職・独自世界観はすべて破棄し、実装へ持ち込まない。

## 1. プロダクト

### 1.1 名称と目的

- 日本語名: `AI人狼`
- 英語名: `AI Werewolf`
- リポジトリ: `ai-werewolf`

> 9体のAIエージェントが、一般的な人狼ゲームを最初から最後まで自律プレイし、人間が公開視点またはGM視点で観戦できるWebアプリ。

### 1.2 MVP

- AIプレイヤー9名固定。
- 9名は固定の名前、行動原理、欠点、感情傾向、話し方を持つ。
- アプリがGMを担当する。
- 人間は開始、観戦、一時停止、再開、中断、リプレイのみを行う。
- 昼の議論、投票、夜の人狼会話・襲撃・役職行動を完全自動進行する。
- 公開視点とGM視点を切り替えられる。
- SQLiteへ全イベントを保存し、試合後にリプレイできる。
- ローカル／セルフホスト前提。Docker対応。
- 観戦UIはPCのデスクトップブラウザ専用とする。
- 画像は実装セッションがCodex組み込み`imagegen`で生成する。
- ON/OFF・個別音量調整可能なオリジナルBGMと、9名別々のVOICEVOX読み上げを備える。

### 1.3 非ゴール

- 人間プレイヤー参加。
- 役職・人数のカスタマイズ。
- アカウント、課金、ランキング、マッチメイキング。
- 多言語対応。
- スマートフォン向けデザイン、タッチ操作最適化、モバイル用レイアウト。
- サーバーレス、複数サーバー、水平スケール。
- 特定の既存人狼製品との互換性・再現。

## 2. 権利方針

### 2.1 使用する範囲

- 昼夜、秘密の役職、議論、投票、襲撃、占い、護衛などの一般的なゲームの仕組み。
- 一般的な役職名と、その一般的な能力。
- 自分たちで書いたルール説明、コード、UI、画像。

### 2.2 使用しないもの

- 特定商品のルールブック文章の転載・言い換え。
- 特定商品のロゴ、カード、画像、UI、固有役職、固有ナレーション。
- 既存人狼アプリの画面構成や絵柄の模倣。

### 2.3 README免責文

> 本プロジェクトは、一般的な人狼ゲームの仕組みを独自に実装したオープンソースのAI実験アプリです。特定の人狼ゲーム製品、企業、団体とは関係がなく、提携または承認を受けたものではありません。ルール説明、コード、UI、画像は本プロジェクト独自のものです。

### 2.4 ライセンス

- コード: MIT License。
- 生成画像: `ASSETS_LICENSE.md` へ利用条件を分離して記載する。
- 画像生成プロンプト、日付、ファイル名を `docs/asset-manifest.md` に残す。

## 3. 標準9人ルール

### 3.1 配役

| 役職 | 陣営 | 人数 | 能力 |
|---|---|---:|---|
| 村人 | 村人陣営 | 3 | 特殊能力なし。会話と投票で人狼を探す |
| 人狼 | 人狼陣営 | 2 | 仲間を知り、夜に相談して1名を襲撃する |
| 占い師 | 村人陣営 | 1 | 毎夜1名が人狼か否かを知る |
| 霊媒師 | 村人陣営 | 1 | 前日に処刑された人物が人狼か否かを知る |
| 狩人 | 村人陣営 | 1 | 毎夜1名を人狼の襲撃から守る |
| 狂人 | 人狼陣営 | 1 | 人間だが、人狼陣営の勝利を目指す。特殊能力なし |

重要:

- 人狼2名は互いを知る。
- 人狼は狂人が誰か知らない。
- 狂人は人狼が誰か知らない。
- 占い師が狂人を占うと `人狼ではない` と出る。
- 霊媒師が処刑された狂人を判定しても `人狼ではない` と出る。
- 狂人は人数判定上は非人狼として数えるが、人狼陣営が勝てば勝利する。
- 狂人自身が死亡していても、人狼陣営が勝てば狂人の勝利とする。

### 3.2 勝利条件

- 村人陣営勝利: 生存する人狼が0名になる。
- 人狼陣営勝利: 生存人狼数が、生存する非人狼人数以上になる。
- 狂人は勝敗判定の「人狼数」には含めない。
- 判定は夜明け後と処刑後に行う。

例:

- 人狼1＋村人系1: 人狼勝利。
- 人狼1＋狂人1: 人狼1、非人狼1なので人狼勝利。
- 人狼1＋狂人1＋村人1: 人狼1、非人狼2なので継続。
- 人狼0＋狂人1: 村人勝利。

### 3.3 第0夜

初日の議論材料を残すため、第0夜は襲撃なしとする。

1. GMがゲーム開始を宣言する。
2. 人狼2名に仲間を非公開通知する。
3. 人狼2名が1回ずつ非公開で顔合わせ会話をする。襲撃先は選ばない。
4. 占い師が自分以外の1名を選んで占う。
5. 占い結果を占い師本人だけへ通知する。
6. 霊媒師と狩人は行動しない。
7. 第1日へ進む。

### 3.4 昼

1. 前夜の犠牲者名、または犠牲者なしをGMが公開する。
2. 勝敗判定。
3. 生存者全員が2周発言する。
4. 生存者全員が同時投票する。
5. 記名投票結果を公開する。
6. 最多得票者を処刑する。
7. 処刑者の名前だけ公開し、役職は試合終了まで公開しない。
8. 勝敗判定。
9. 未決着なら夜へ進む。

### 3.5 発言

- 1日につき各生存者2発言。
- 1発言は日本語200 Unicode code point以内。
- 空文字は `……（沈黙）` として扱う。
- 発言順は座席順で、毎日開始座席を1つずつずらす。
- CO、占い結果・霊媒結果の共有、騙り、嘘、弁明、質問は自由。
- システムは役職COや結果報告の真偽を証明しない。

### 3.6 投票と同数

- 棄権不可。自分には投票できない。
- 投票は情報上同時に行う。先に投票したAIの票を後続AIへ見せない。
- 全票確定後、誰が誰に入れたかを一括公開する。
- 同数最多の場合は、その同数候補だけで決選投票を1回行う。
- 決選も同数なら、その日は処刑なしとする。
- 処刑なしも一般的な同票処理の一つであり、独自演出やランダム処刑は採用しない。

### 3.7 夜

処刑後、以下の順に処理する。

1. 生存する霊媒師へ、その日に処刑された人物が人狼か否かを非公開通知する。処刑なしなら `判定対象なし`。
2. 生存人狼が非公開会話を2周行う。
3. 各人狼が襲撃候補を選ぶ。
4. 生存占い師が占い対象を選ぶ。
5. 生存狩人が護衛対象を選ぶ。
6. 夜行動を同時解決する。
7. 襲撃先と護衛先が一致すれば犠牲者なし。それ以外は襲撃先が死亡する。
8. 次の昼へ進む。

### 3.8 人狼の襲撃

- 人狼自身と人狼仲間は襲撃対象にできない。
- 狂人は人狼から見ても正体不明なので、襲撃対象になり得る。
- 人狼2名の選択が一致すれば採用する。
- 不一致なら、追加の最終決定判断を座席番号の小さい生存人狼へ1回だけ依頼する。候補は両者が選んだ2名に限定する。
- 人狼1名なら単独で決める。

### 3.9 占い師

- 自分は占えない。
- 死亡者は占えない。
- 同じ人物を再度占えるが、プロンプトでは未占い人物を優先するよう求める。
- 結果は `人狼` / `人狼ではない` の二値。
- 狂人は `人狼ではない`。

### 3.10 霊媒師

- 前日に処刑された人物だけを判定する。
- 結果は `人狼` / `人狼ではない` の二値。
- 狂人は `人狼ではない`。
- 襲撃で死亡した人物は判定しない。
- 結果は本人だけが知り、昼に共有するかはAIが判断する。

### 3.11 狩人

- 自分を護衛できる。
- 前夜と同じ対象を連続護衛できない。
- 連続護衛禁止によって合法対象がなくなる場合のみ解除する。
- 護衛成功時も、誰を護衛したか・狩人が誰かは公開しない。

### 3.12 死亡・役職公開

- 死亡者は以後、発言・投票・夜行動を行わない。
- 死亡者は能力・襲撃の対象にならない。
- 処刑・襲撃時に役職を公開しない。
- 試合終了時だけ、全員の役職と全非公開行動を公開する。
- 死者チャットはMVPに含めない。

### 3.13 停止性と異常系

- 第9日終了でも決着しなければ、異常フラグ付き引き分けとする。
- 物理OpenAI API呼び出しが240回へ到達する前に `aborted_budget` で停止する。
- AI判断失敗時はゲームを明示的に停止し、ランダム行動や別モデルで続行しない。

## 4. AI判断

### 4.1 モデル固定

すべてのAI判断はOpenAI Responses APIで以下へ固定する。

```ts
model: 'gpt-5.6-luna'
reasoning: { effort: 'low' }
```

対象:

- 昼の発言。
- 役職COや結果共有をするかどうか。
- 投票、決選投票。
- 人狼会話、襲撃候補、襲撃先の最終決定。
- 占い対象、護衛対象。
- 狂人の騙り・誘導を含む全戦略判断。

AI判断ではないもの:

- 配役、合法対象、昼夜遷移、票集計、勝敗、霊媒結果、占い結果、護衛結果。
- これらは決定論コードで処理する。

別モデルへのフォールバックは禁止。モデルが利用不能なら停止する。

### 4.2 実AIの利用制限と費用管理

- 開発中の既定AIは必ず `MockAI` とする。
- Unit、Integration、Leak、E2E、UI確認、デバッグ、CI、反復シミュレーションではOpenAI APIを一切呼ばない。
- OpenAIクライアントの実装とテストには、固定レスポンスを返すMock transportを使う。
- `--ai real` を明示し、かつ環境変数 `ALLOW_REAL_AI=1` がある場合だけ実AIを許可する。片方でもなければ起動を拒否する。
- 実AIは、lint、typecheck、全自動テスト、MockAI 30試合、build、Docker buildがすべて成功した後の**最終受け入れ試験**でのみ使用する。
- 最終受け入れ試験は実AIによる1試合完走だけとし、開発途中の動作確認、調整、勝率測定には使用しない。
- 実AI試験が失敗した場合は結果と消費呼び出し数を保存して停止する。原因修正後も、MockAIで再検証を完了するまで実AIを再実行しない。
- READMEと`.env.example`にも、実AIは有料であり最終確認専用であることを明記する。

### 4.3 OpenAI SDK

SDKの自動リトライは無効化し、アプリ側だけで回数を管理する。

```ts
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 60_000,
});

const response = await client.responses.parse({
  model: 'gpt-5.6-luna',
  reasoning: { effort: 'low' },
  input: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: decisionPrompt },
  ],
  text: { format: zodTextFormat(schema, 'werewolf_decision') },
});
```

### 4.4 情報分離

全AIが受け取る情報:

- 一般ルール。
- 自分の座席と役職。
- 全員の座席・生死。
- 公開済み発言、GM発表、記名投票。
- 現在の日・フェーズ・求められている判断。

役職固有:

- 人狼: 仲間、生存人狼だけの夜会話、過去の自分たちの襲撃選択。
- 占い師: 自分の全占い履歴と結果。
- 霊媒師: 自分の全霊媒結果。
- 狩人: 自分の全護衛履歴。
- 狂人: 追加情報なし。人狼を推理して支援する。

渡してはいけない情報:

- 他人の本当の役職。
- 他役職の非公開結果。
- 未公開票。
- 人狼以外への人狼会話。
- GM視点用の判断メモ。
- OpenAIの内部reasoning。

### 4.5 エージェントの同一性

- プレイヤー名は `名取 澪`、`八木 こはる`、`宮下 さくら`、`雨宮 しずく`、`神崎 レナ`、`黒田 剛`、`真壁 陽太`、`青木 征司`、`久遠 ひより`。
- 各人に行動原理、内面の矛盾、欠点、対人バイアス、感情傾向、発言量の差を与える。
- 人格は推理能力や秘密情報を増やさない。同じ公開情報でも、好き嫌い、見栄、迷い、思い込みによって判断と表現が変わる。
- 全体要約や模範解答調の発言を避け、直前の相手へ自然に反応する。ただし口癖や欠点を毎回わざとらしく演じない。
- 個別人格は一般的な人間関係の範囲に留め、独自職業、固有能力、物語上の世界設定を持ち込まない。

### 4.6 Structured Outputs

```ts
const SpeechDecision = z.object({
  speech: z.string(),
});

const TargetDecision = z.object({
  targetSeat: z.enum(legalSeatIds),
  statedReason: z.string().max(120),
});
```

- 対象は名前ではなく `seat-1`〜`seat-9`。
- 合法対象のみを動的enumへ入れる。
- `statedReason` は短い説明であり、chain-of-thoughtを要求しない。
- 発言、投票、襲撃、占い、護衛をstrict schemaで処理する。

### 4.7 リトライ

- 最大5回。
- 1、2、4、8、16秒の指数バックオフ。
- 再試行: 接続失敗、タイムアウト、408、409、429、5xx、refusal、parse失敗。
- 400、401、403、404は即 `paused_error`。
- 5回失敗も `paused_error`。
- 再開は同じ `gpt-5.6-luna` で同じ判断を再試行するだけ。

### 4.8 API呼び出し上限

- `MAX_API_CALLS = 240`。
- リトライを含む物理HTTP呼び出し数を数える。
- 呼び出し直前にDBへカウンタと `in_flight` を保存する。
- 上限へ到達する呼び出しは送信しない。

### 4.9 クラッシュ時の境界

- 保存済みAI応答は再起動後に再利用する。
- OpenAI応答受信後・DB保存前にプロセスが落ちた可能性がある `in_flight` は自動再実行しない。
- `ambiguous_ai_call` として停止し、人間が再試行を選ぶ。
- この狭い障害窓では二重課金の可能性はあるが、ゲームイベントは一度だけ確定する。

## 5. 観戦UI

### 5.1 視点

| 情報 | 公開視点 | GM視点 | 終了後 |
|---|---:|---:|---:|
| 発言、投票、死亡 | ○ | ○ | ○ |
| 本当の役職 | × | ○ | ○ |
| 人狼会話 | × | ○ | ○ |
| 襲撃・占い・霊媒・護衛 | × | ○ | ○ |
| statedReason | × | ○ | ○ |

- 公開データはサーバー側でホワイトリスト射影する。
- 秘密情報をブラウザへ送ってCSSで隠す方式は禁止。
- ライブ中に公開／GM視点を切り替えられる。

### 5.2 画面

| パス | 内容 |
|---|---|
| `/` | 新規試合開始、seed・速度、試合一覧 |
| `/match/[id]` | ライブ観戦 |
| `/replay/[id]` | 保存イベントのリプレイ |

ホーム:

- `AI人狼` テキストロゴ。
- seed入力。空なら自動生成。
- 速度: ゆっくり3秒、標準1.5秒、最速0秒。
- `AI人狼を開始` ボタン。
- 試合一覧: 日時、seed、状態、勝者、日数。

ライブ:

- ヘッダー: 日数、昼夜・フェーズ、公開／GM視点、状態。
- 中央: 固有名を持つ9人のカード。座席、生死、最新発言、GM視点の役職バッジ。
- 右: 時系列ログ。発言、投票、処刑、夜明け。
- 下: pause/resume、速度、中断。
- 投票は記名票と得票バーを表示。
- `paused_error`ではモデル名、失敗フェーズ、再試行を表示する。
- 終了時は勝利陣営と全配役を表示する。

リプレイ:

- ライブと同じコンポーネントを使う。
- イベントseqのシークバー。
- 前後イベント、前後フェーズ、再生、停止、速度。
- AIとゲームエンジンを再実行しない。

### 5.3 PC表示とアクセシビリティ

- 対象環境はPCのデスクトップブラウザのみとする。
- 基準ビューポートは1440×900px、最低対応幅は1280pxとする。
- エージェント盤面＋ログの2カラムを基本レイアウトとする。
- 1280px未満の画面、スマートフォン、縦画面、タッチ操作は設計・実装・テスト対象外とする。
- レスポンシブ対応やモバイル専用UIを追加しない。
- 色だけで生死・役職を区別しない。
- `aria-live='polite'`。
- Spaceでpause/resume、リプレイで左右キー。
- WCAG AA。
- `prefers-reduced-motion`対応。

### 5.4 ビジュアル

- 人狼ゲームとして分かりやすい、シンプルな昼／夜の村背景。
- 独自の物語テーマや固有世界観は設けない。
- UIは濃紺、灰、白を基調に、昼は暖色、夜は青紫を補助色にする。
- 月、投票箱、占い、水晶、霊媒、盾、狼などの単純アイコンは独自SVG/CSSで作る。
- 特定製品のロゴ・カード枠・配色を模倣しない。

## 6. imagegenアセット

実装セッションはCodex組み込み `imagegen` を使う。画像APIの自作スクリプトや外部画像生成は使わない。

### 6.1 共通条件

```text
Use case: illustration-story
Asset type: original AI Werewolf web game artwork
Style/medium: clean contemporary digital game illustration, soft cel shading, readable silhouettes
Composition: centered subject with generous margins, consistent style across the set
Constraints: generic werewolf-game imagery only; no reference to a specific commercial product; no text; no letters; no numbers; no logo; no watermark
```

### 6.2 必須9点

| ファイル | 内容 |
|---|---|
| `role_villager.png` | 一般的な村人を示す中立的な人物シルエット |
| `role_werewolf.png` | 月夜の狼男シルエット。過度に残虐にしない |
| `role_seer.png` | 水晶を使う占い師 |
| `role_medium.png` | 静かに霊と向き合う霊媒師 |
| `role_bodyguard.png` | 盾で誰かを守る狩人／護衛者 |
| `role_madman.png` | 仮面を持ち、陣営を混乱させる狂人。精神疾患を侮辱する表現は禁止 |
| `bg_day.png` | 議論用の明るい村の広場。人物なし |
| `bg_night.png` | 同じ構図の夜の村。人物なし |
| `keyart_ogp.png` | 9つのAIシルエットが円卓で議論し、背景に月と狼の影 |

- 生成物は `public/assets/` へ保存する。
- `docs/asset-manifest.md` に最終プロンプト、生成日、用途を記録する。
- UIの9人のアバターは、各人格と声の印象に合わせた独自生成画像とする。VOICEVOX公式キャラクターや既存IPは描かない。
- 9点すべて目視し、文字・透かし・既存IP類似・画風不一致を除去する。

## 7. 技術設計

### 7.1 スタック

- Node.js 22 LTS。
- Next.js 15.5.20 App Router、React 19.2.7、TypeScript 5.9.3。
- Tailwind CSS 4.3.2。
- OpenAI Node SDK 6.47.0、Zod 4.4.3。
- better-sqlite3 12.11.1。
- Vitest 4.1.10、Playwright 1.61.1。
- Pino 10.3.1。
- npm＋コミット済み `package-lock.json`。

### 7.2 実行構成

- Next.jsを `output: 'standalone'` でセルフホストする。
- 単一常駐Nodeプロセス。
- SQLiteを永続ボリュームへ置く。
- Vercel等のサーバーレスは非対応。
- `MatchRunnerManager`をプロセスシングルトンとして保持する。
- 1試合につきRunnerは1本、AI判断は直列。
- 同時進行試合上限は2。
- `src/instrumentation.ts` でDB初期化とrunning試合の復旧を行う。

### 7.3 レイヤー

```text
domain: 型、役職、定数
engine: 純粋な状態fold、合法手、勝敗、seed乱数、次command
server: SQLite、Runner、OpenAI、SSE、view filter、log
app/api: REST/SSE境界
ui: 表示とリプレイprojector
```

- engineからDB、OpenAI、fetch、Date、Math.randomを使わない。
- SQLはrepo層だけに置く。
- OpenAI SDK importは `server/ai/client.ts` だけに置く。

### 7.4 ディレクトリ

```text
ai-werewolf/
├── AGENTS.md
├── README.md
├── LICENSE
├── ASSETS_LICENSE.md
├── package.json / package-lock.json
├── .nvmrc / .env.example
├── next.config.ts / eslint.config.mjs
├── Dockerfile / docker-compose.yml
├── migrations/001_init.sql
├── docs/implementation-plan.md
├── docs/asset-manifest.md
├── public/assets/
├── scripts/{migrate,sim}.ts
├── src/instrumentation.ts
├── src/domain/{types,constants,events}.ts
├── src/engine/{prng,setup,state,legal,step,apply,victory,narration}.ts
├── src/server/{db,repo,runner,bus,view,log}.ts
├── src/server/ai/{client,mock,prompts,schemas}.ts
├── src/app/
├── src/ui/
└── test/{unit,integration,leak,e2e}/
```

### 7.5 ドメイン型

```ts
type Role = 'villager' | 'werewolf' | 'seer' | 'medium' | 'bodyguard' | 'madman';
type Team = 'village' | 'werewolf';
type SeatId = `seat-${1|2|3|4|5|6|7|8|9}`;
type MatchStatus =
  | 'running' | 'paused' | 'paused_error'
  | 'finished' | 'aborted' | 'aborted_budget';
type Winner = 'village' | 'werewolf' | 'draw';
type Visibility = 'public' | 'private';
```

### 7.6 イベント

| event | 可視性 |
|---|---|
| `match_created` | GM |
| `werewolf_reveal` | 人狼 |
| `werewolf_chat` | 人狼 |
| `discussion_speech` | 公開 |
| `vote_cast` | 開票までGM |
| `vote_reveal` | 公開 |
| `execution` | 公開 |
| `medium_result` | 霊媒師 |
| `attack_choice` | 人狼 |
| `seer_result` | 占い師 |
| `guard_choice` | 狩人 |
| `night_resolved` | GM |
| `dawn` | 公開 |
| `decision_note` | GM |
| `match_finished` | 公開 |
| `match_aborted` / `budget_exceeded` / `anomaly_flag` | 状況に応じ公開またはGM |

イベント封筒:

```ts
interface MatchEvent<T extends string, P> {
  matchId: string;
  seq: number;
  day: number;
  phase: Phase;
  type: T;
  visibility: 'public' | 'private';
  audienceSeats: number[];
  payload: P;
  createdAt: string;
}
```

### 7.7 SQLite

テーブル:

- `matches`: id、seed、status、winner、config_json、speed、api_calls、error_json、timestamps。
- `events`: match_id、seq、day、phase、type、visibility、audience、payload、created_at。PK `(match_id, seq)`。
- `ai_calls`: match_id、call_key、request_hash、status (`in_flight|ok|failed`)、response、attempts、OpenAI request ID、timestamps。PK `(match_id, call_key)`。
- `schema_migrations`。

必須:

- WAL。
- foreign keys ON。
- 1判断のAI記録、生成イベント群、match更新を1トランザクションで保存する。
- commit後だけSSE通知する。
- 保存済み`ok`判断は再利用する。
- `(match_id, seq)`と`(match_id, call_key)`で重複を防ぐ。

### 7.8 決定論

- `Math.random()`禁止。
- `rand(seed, purposeKey)` で用途ごとに乱数を導出する。
- 配役シャッフル、発言開始座席、GM固定文選択に使う。
- AI出力自体は決定論とみなさない。
- 同seed＋MockAIならイベントpayload列を一致させる。

### 7.9 API

| API | 契約 |
|---|---|
| `POST /api/matches` | `{seed?, speed?}` → `{id,seed}` |
| `GET /api/matches` | 試合一覧 |
| `GET /api/match/:id?view=public|gm&fromSeq=n` | filter済みsnapshot/events |
| `GET /api/match/:id/stream?view=...&fromSeq=n` | SSE catch-up＋live |
| `POST /api/match/:id/control` | pause/resume/abort/retry |

- SSE idはseq。
- `Last-Event-ID`対応。
- 15秒ping。
- 視点変更時はsnapshotを再取得する。
- エラーは `{error:{code,message}}`。

### 7.10 リプレイ

- ライブとリプレイは同じ `projectView(events)` を使う。
- 保存イベントをseq位置までfoldする。
- AIやengineを再実行しない。
- 公開視点とGM視点を切り替えたら、その視点のイベントをサーバーから再取得する。

### 7.11 セキュリティ

- `OPENAI_API_KEY`はサーバー専用。
- `NEXT_PUBLIC_`禁止。
- prompt、AI本文、役職、人狼会話、APIキーをログへ出さない。
- ログはmatchId、callKey、attempt、status、request ID、latency、token usageだけ。
- 認証なしでインターネットへ公開しない。
- 公開ホストする場合はリバースプロキシ認証、IP／レート制限が必要とREADMEへ記載する。
- 標準利用形態は、各利用者が自分のAPIキーでセルフホストすること。

### 7.12 npm scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "node .next/standalone/server.js",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:unit": "vitest run test/unit",
  "test:integration": "vitest run test/integration",
  "test:leak": "vitest run test/leak",
  "test:e2e": "playwright test",
  "sim": "tsx scripts/sim.ts",
  "db:migrate": "tsx scripts/migrate.ts"
}
```

## 8. テスト

### 8.1 Unit

- 9人配役が正しい。
- 勝敗で狂人を非人狼人数として数える。
- 狂人の占い・霊媒結果は人狼ではない。
- 人狼同士だけが互いを知る。
- 第0夜に襲撃・護衛・霊媒がない。
- 昼2周、発言順ローテーション。
- 投票の同時性、決選、再同票時処刑なし。
- 人狼襲撃不一致時の追加決定。
- 占い、霊媒、護衛、襲撃合法対象。
- 連続護衛禁止。
- 200字切詰め、沈黙。
- 全勝利条件と終端。
- event foldとseed乱数。

### 8.2 Integration

- MockAIで試合完走。
- 同seedのpayload列一致。
- Runner再生成から復旧。
- pause/resume、abort。
- 5回失敗→paused_error→retry。
- `in_flight`残存→ambiguous停止。
- API上限。
- Runner二重起動防止。

### 8.3 Leak

全phaseの公開viewに以下が存在しないことをstrict schemaで確認する。

- 未公開role。
- `werewolf_chat`、`attack_choice`。
- `seer_result`、`medium_result`、`guard_choice`。
- `night_resolved`、`decision_note`、audience、config_json。

### 8.4 E2E

- ホーム→開始→ライブ→終了。
- 公開／GM視点。
- pause/resume、error/retry、abort。
- 投票表示。
- 全配役の終了表示。
- リプレイ、シーク、フェーズ移動。
- 1440×900px、1280×720px、キーボード。

### 8.5 MockAI反復試験

```bash
npm run sim -- --matches 30 --ai mock --seed-base 1000
```

- 30試合無クラッシュ。
- 全試合が終端する。
- 同じseedで同じイベント列になる。
- API呼び出し数が0である。

### 8.6 最終実AI受け入れ試験

以下の試験は、8.1〜8.5、build、Docker buildがすべて成功した後、全工程の最後に1回だけ実行する。

```bash
ALLOW_REAL_AI=1 npm run sim -- --matches 1 --ai real --seed-base 1000
```

合格条件:

- 1試合がクラッシュせず終端する。
- 使用モデルが `gpt-5.6-luna` である。
- 全リクエストが `reasoning.effort=low` である。
- 240回のAPI上限を超えない。
- 秘密情報の漏洩がない。

勝率やゲームバランスを測るために実AIを複数試合実行しない。問題があればまず保存ログとMockAIで調査し、配役・ルール変更はマスターの承認なしに行わない。

## 9. 実装順序

1. `M0`: 新規repo、計画書コピー、依存固定、AGENTS.md。
2. `M1`: domain/engineとunit tests。
3. `M2`: SQLite、Runner、MockAI、復旧、integration tests。
4. `M3`: REST/SSE、view filter、leak tests。
5. `M4`: ホームとライブUI。
6. `M5`: OpenAI Responses API実装。
7. `M6`: リプレイ、PC向けaccessibility、E2E。
8. `M7`: imagegenで9画像生成・保存・接続。
9. `M8`: README、ライセンス、CI、Docker、MockAI最終検証。すべて合格後に実AIを1試合だけ実行。

## 10. CI

```text
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:leak
npm run build
npm run test:e2e
npm run sim -- --matches 5 --ai mock
docker build .
```

CIで実OpenAI APIは呼ばない。CI環境には `ALLOW_REAL_AI` と `OPENAI_API_KEY` を設定しない。

## 11. Definition of Done

1. 役職が村人3、人狼2、占い師1、霊媒師1、狩人1、狂人1である。
2. 独自役職名・独自世界観・独自ゲーム名がコード、UI、READMEにない。
3. `gpt-5.6-luna`以外の本番モデル名がない。
4. 全実AI呼び出しが `reasoning.effort='low'`。
5. フォールバックモデル・ランダム代替行動がない。
6. `npm ci && npm run lint && npm run typecheck && npm test && npm run build`成功。
7. E2E成功。
8. MockAI 30試合完走。
9. 全phaseのleak test成功。
10. Runner再起動でイベント重複なし。
11. 投票が全票確定まで非公開。
12. 狂人の占い・霊媒・勝敗処理が正しい。
13. pause/resume、error/retry、abortが動く。
14. SSE再接続で欠落がない。
15. リプレイが保存イベントだけを再生する。
16. 1440×900px／1280×720pxのPC表示、WCAG AA、キーボード、reduced motion対応。
17. `Math.random`が`src/`にない。
18. APIキー・prompt・AI本文・秘密役職がログに出ない。
19. imagegen生成画像9点が`public/assets/`にあり、UIで使用される。
20. READMEに権利免責、セルフホスト、非serverless、公開ホスト警告がある。
21. Docker再起動後もDBとrunning試合が残る。
22. 開発、CI、全自動テスト、30試合シミュレーションのAPI呼び出し数が0である。
23. `--ai real`と`ALLOW_REAL_AI=1`の二重条件がなければ実AIを呼べない。
24. git差分に秘密・無関係ファイルがない。
25. 1〜24を満たした後、最後に実APIで1試合だけ完走し、実際のモデルが`gpt-5.6-luna`である。
26. マスターの明示指示なしにpushしない。

## 12. 次のCodexセッションへ渡すプロンプト

```text
/Users/user/WorkSpace/nikechan/docs/ai-werewolf-implementation-plan.md を唯一の正本として読み、
/Users/user/WorkSpace/ai-werewolf にAI人狼Webアプリを新規実装してください。

これは独自ゲームではなく、標準的な9人人狼です。
役職は村人3、人狼2、占い師1、霊媒師1、狩人1、狂人1の名称と能力をそのまま使ってください。
独自の役職名、世界観、物語、キャラクター設定を追加しないでください。

M0からM8を順に実装し、Definition of Doneをすべて検証してください。
全AI判断はOpenAI Responses APIのgpt-5.6-luna、reasoning.effort=lowに固定し、フォールバックを作らないでください。
開発・デバッグ・CI・全自動テスト・反復試験はすべてMockAIで行い、OpenAI APIを呼ばないでください。
実AIは全Mock検証、build、Docker buildが合格した最終段階に限り、ALLOW_REAL_AI=1と--ai realを明示して1試合だけ実行してください。
画像9点はCodex組み込みimagegenで生成してプロジェクトへ保存してください。
既存の/Users/user/WorkSpace/nikechanの無関係な変更には触れず、pushもしないでください。
```

## 13. 修正監査

今回破棄したもの:

- 独自タイトル。
- 独自役職名。
- 少人数向けの独自配役。
- 村人の職業・名前・口調などの独自ペルソナ。
- 独自世界観に依存する固有演出。
- 独自の推理劇世界観。

維持したもの:

- Fableが設計したライブ観戦、公開／GM視点、リプレイをPC向けUIとして維持。
- 純粋ゲームエンジン、SQLiteイベントソーシング、常駐Runner、SSE。
- OpenAI Responses API、Structured Outputs、秘密情報のサーバー側分離。
- Codex imagegenによる独自画像制作。
- Codex監査で補正したリトライ、ログ秘匿、クラッシュ境界、依存固定。

最終確認: 本書は一般的な人狼をAIにプレイさせる仕様であり、オリジナル人狼風ゲームの仕様ではない。
