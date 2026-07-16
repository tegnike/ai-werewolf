# Acceptance report

実施日: 2026-07-16

## 自動検証

| 検証 | 結果 |
|---|---|
| `npm run lint` | 合格 |
| `npm run typecheck` | 合格 |
| `npm test` | 14 files / 45 tests 合格 |
| Leak test | 公開viewへの秘密イベント・未公開役職・audience漏洩なし |
| MockAI 30試合 | 30/30終端、各試合API calls 0 |
| E2E 1440×900 | 2 scenarios 合格 |
| E2E 1280×720 | 2 scenarios 合格 |
| `npm run build` | 合格 |
| `docker build` | 合格 |
| Docker再起動 | 同一volumeで終了済み試合が `finished` のまま復元 |
| production依存監査 | 既知脆弱性0 |

E2Eではホームからの開始、公開／GM視点、公開視点の夜表示、生存数、記名投票、終了後の秘密開示、日区切りログ、ミニエピローグ、観戦ガイド、リプレイ途中のエピローグ非表示、Spaceキーのpause/resume、abortを確認した。観戦ガイドはEscapeキーで閉じる操作も確認した。

ブラウザ目視では、既存保存試合を使い1440×900と1280×720で、陣営別の全配役、9名の運命と勝敗、狂人の注記、プレイヤーカード、投票結果、時系列ログ、固定フッターを確認した。1280pxではエピローグを陣営内2列に切り替え、カード1段目が固定フッターの直前までに収まる。両解像度ともdocument幅とviewport幅が一致し、横スクロールはない。観戦ガイドも1280×720内へ収まることを確認した。

P1確認画像:

- `tmp/fable-call/p1-implemented-1440.png`
- `tmp/fable-call/p1-implemented-1280.png`
- `tmp/fable-call/p1-guide-1280.png`

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
- 進行中の公開イベントpayloadに `statedReason`、秘密イベント、役職、audienceなし。終了後は全秘密を開示。
- 画像9点を `public/assets/` に配置し、文字・透かし・既存IP類似がないことを目視確認。
- pushは実行していない。
