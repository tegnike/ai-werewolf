# AI人狼 実装規約

- `/docs/implementation-plan.md` を仕様の正本とする。
- 一般的な9人人狼から独自役職・世界観へ変更しない。
- 開発・テスト・CI・反復試験はMockAIのみを使う。
- 実AIは `--ai real` と `ALLOW_REAL_AI=1` の二重条件がある最終受け入れ試験に限る。
- OpenAI本番モデルは `gpt-5.6-luna`、`reasoning.effort='low'` に固定し、フォールバックしない。
- `src/` で `Math.random()` を使わない。秘密情報はサーバー側で射影する。
- APIキー、prompt、AI本文、秘密役職をログへ出さない。
- pushはマスターの明示指示がある場合だけ行う。
