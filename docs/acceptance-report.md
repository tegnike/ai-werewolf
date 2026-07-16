# Acceptance report

実施日: 2026-07-16

## 自動検証

| 検証 | 結果 |
|---|---|
| `npm run lint` | 合格 |
| `npm run typecheck` | 合格 |
| `npm test` | 7 files / 15 tests 合格 |
| Leak test | 公開viewへの秘密イベント・未公開役職・audience漏洩なし |
| MockAI 30試合 | 30/30終端、各試合API calls 0 |
| E2E 1440×900 | 2 scenarios 合格 |
| E2E 1280×720 | 2 scenarios 合格 |
| `npm run build` | 合格 |
| `docker build` | 合格 |
| Docker再起動 | 同一volumeで終了済み試合が `finished` のまま復元 |
| production依存監査 | 既知脆弱性0 |

E2Eではホームからの開始、公開／GM視点、終了表示、リプレイ、Spaceキーのpause/resume、abortを確認した。ブラウザ目視ではAgentカード9枚、投票、終了時全配役、時系列ログ、コンソールエラー0件を確認した。

## 実AI最終受け入れ試験

全Mock検証、build、Docker buildの後に、設計書どおり1試合だけ実行した。

| 項目 | 結果 |
|---|---|
| コマンド条件 | `--ai real` + `ALLOW_REAL_AI=1` |
| 試合数 | 1 |
| seed | 1000 |
| 終端 | 人狼陣営勝利 |
| 保存イベント | 113 |
| 物理API呼び出し | 94 / 240 |
| 実際のモデル | `gpt-5.6-luna` |
| reasoning | `effort=low`, `mode=standard` |
| Responses status | `completed` |
| AI call records | 全件 `ok` |

APIキー、prompt、AI本文、秘密役職はログおよび本レポートへ保存していない。モデル確認は保存済みResponse IDの取得APIを使用し、追加の推論試験は実行していない。

## 静的監査

- `src/` に `Math.random()` なし。
- 本番モデル文字列は `gpt-5.6-luna` のみ。
- 実APIキーのリポジトリ混入なし。
- フォールバックモデル、ランダム代替行動なし。
- 画像9点を `public/assets/` に配置し、文字・透かし・既存IP類似がないことを目視確認。
- pushは実行していない。
