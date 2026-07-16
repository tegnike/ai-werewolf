# AI人狼 / AI Werewolf

9体の匿名AIエージェントが、一般的な9人人狼を最初から最後まで自律プレイし、人間が公開視点またはGM視点で観戦できるセルフホストWebアプリです。

## ルール

- 村人3、人狼2、占い師1、霊媒師1、狩人1、狂人1。
- 第0夜は人狼の顔合わせと占いだけを行い、襲撃はありません。
- 昼は生存者が2周発言し、全員の票が確定してから記名投票を公開します。
- 最多同票は1回だけ決選投票し、再同票なら処刑なしです。
- 狩人は連続護衛不可。狂人の占い・霊媒結果は「人狼ではない」です。
- 人狼全滅で村人陣営、生存人狼数が生存非人狼数以上で人狼陣営の勝利です。

## 起動

Node.js 22以上とnpmを使用します。

```bash
npm ci
npm run db:migrate
npm run dev
```

[http://localhost:3000](http://localhost:3000) をPCブラウザで開いてください。基準表示は1440×900px、最低幅は1280pxです。

通常のWeb画面、開発、CI、テスト、シミュレーションはすべて決定論的なMockAIを使い、OpenAI APIを呼びません。

## 検証

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run sim -- --matches 30 --ai mock --seed-base 1000
docker build .
```

同じseedとMockAIからは同じイベントpayload列が生成されます。試合はSQLiteへ保存され、終了後のリプレイは保存イベントだけを再生します。

## 実AIの最終受け入れ試験

実AIには利用料金が発生します。lint、typecheck、全テスト、MockAI 30試合、Next.js build、Docker buildがすべて成功した後に限り、1試合だけ実行してください。

```bash
export OPENAI_API_KEY='your-key'
ALLOW_REAL_AI=1 npm run sim -- --matches 1 --ai real --seed-base 1000
```

`--ai real` と `ALLOW_REAL_AI=1` の両方がなければ実AIは起動しません。本番モデルは `gpt-5.6-luna`、reasoning effortは `low` 固定です。別モデルへのフォールバックやランダム代替行動はありません。物理API呼び出しはリトライを含め240回未満で停止します。

## 構成

- Next.js App Router + React + TypeScript
- SQLiteイベントソーシング + WAL
- 常駐 `MatchRunnerManager`、1試合1Runner、AI判断は直列
- REST + SSE（`Last-Event-ID`対応、15秒ping）
- OpenAI Responses API + Zod Structured Outputs
- 公開視点はサーバー側ホワイトリスト射影。秘密をCSSで隠しません
- リプレイはイベントfoldだけを使用し、AIやゲームエンジンを再実行しません

設計の正本は [docs/implementation-plan.md](docs/implementation-plan.md)、生成画像の記録は [docs/asset-manifest.md](docs/asset-manifest.md) です。

## Docker

```bash
docker compose up --build
```

SQLiteはnamed volume `ai-werewolf-data` に保存されます。Next.js standaloneの単一常駐Nodeプロセスを前提とし、Vercel等のサーバーレスには対応しません。

## セキュリティ

- `OPENAI_API_KEY` はサーバー環境変数にだけ設定し、`NEXT_PUBLIC_`へ入れないでください。
- prompt、AI本文、役職、非公開行動、APIキーはアプリログへ出しません。
- 認証なしでインターネットへ公開しないでください。公開が必要な場合は、リバースプロキシ認証、IP制限、レート制限を追加してください。
- 標準利用形態は、利用者が自分のAPIキーでローカルまたは信頼できるホストへセルフホストする形です。

## 権利と免責

本プロジェクトは、一般的な人狼ゲームの仕組みを独自に実装したオープンソースのAI実験アプリです。特定の人狼ゲーム製品、企業、団体とは関係がなく、提携または承認を受けたものではありません。ルール説明、コード、UI、画像は本プロジェクト独自のものです。

コードはMIT Licenseです。生成画像の条件は [ASSETS_LICENSE.md](ASSETS_LICENSE.md) を参照してください。
