# Asset manifest

生成日: 2026-07-16  
生成方法: Codex組み込み `imagegen`（built-in tool mode）  
用途: AI人狼Webアプリ専用の独自画像

## 共通指定

> Clean contemporary digital game illustration, soft cel shading, readable silhouettes, refined dark navy and muted gold palette. Generic werewolf-game imagery only. No reference to a specific commercial product; no text, letters, numbers, logo, watermark, or gore.

| ファイル | 用途 | 最終プロンプトの主題 |
|---|---|---|
| `role_villager.png` | 村人バッジ | 中立的な人間の村人、簡素な服、落ち着いた観察姿勢、正方形 |
| `role_werewolf.png` | 人狼バッジ | 月光下の抑制された人狼、残虐表現なし、正方形 |
| `role_seer.png` | 占い師バッジ | 人間の占い師が水晶を見つめる。動物的特徴なし、正方形 |
| `role_medium.png` | 霊媒師バッジ | 人間の霊媒師が小さな霊光と静かに向き合う。恐怖表現なし、正方形 |
| `role_bodyguard.png` | 狩人バッジ | 人間の護衛者が広い盾で誰かを守る。軍事的・動物的特徴なし、正方形 |
| `role_madman.png` | 狂人バッジ | 人間の策略家が無地の仮面を持つ。精神疾患を示す表現なし、正方形 |
| `bg_day.png` | 昼背景 | 人物のいない明るい村の広場、中央に井戸、UI用16:9 |
| `bg_night.png` | 夜背景 | 同種の構図を青紫の月明かりにした無人の村、UI用16:9 |
| `keyart_ogp.png` | OGP | 円卓に座る匿名シルエットを正確に9体、月と狼の影、16:9 |
| `agents/agent_1.png` | Agent 1立ち絵 | 琥珀色を差し色にした赤褐色ボブの成人女性、冷静な調停役 |
| `agents/agent_2.png` | Agent 2立ち絵 | ライム色を差し色にした淡い緑の短髪、中性的で快活な直感派 |
| `agents/agent_3.png` | Agent 3立ち絵 | 空色を差し色にした茶色のポニーテールの若い女性、社交的な観察者 |
| `agents/agent_4.png` | Agent 4立ち絵 | ミント色を差し色にした濃い青緑髪の成人女性、慎重な検証役 |
| `agents/agent_5.png` | Agent 5立ち絵 | ローズ色を差し色にした長い深紅髪の成人女性、自信家の論客 |
| `agents/agent_6.png` | Agent 6立ち絵 | 黄土色を差し色にした黒い短髪の成人男性、寡黙な懐疑派 |
| `agents/agent_7.png` | Agent 7立ち絵 | オレンジを差し色にした砂色の無造作髪の若い男性、熱血な行動派 |
| `agents/agent_8.png` | Agent 8立ち絵 | コバルトを差し色にした濃紺の撫で付け髪の壮年男性、長期視点の戦略家 |
| `agents/agent_9.png` | Agent 9立ち絵 | シアンを差し色にした紫がかった黒髪の若い女性、静かな観察者 |

## 最終補正

- 役職画像は、村人以外まで人狼に見える初稿を採用せず、人間役職4点を再生成した。
- OGP初稿の人数誤差を採用せず、最終画像は座席シルエット9体を目視確認した。
- 全画像に文字、透かし、ロゴ、既存製品固有の意匠がないことを目視確認した。
- UI格納時に役職画像を768×768px、背景とOGPを1920×1080pxへ縮小した。
- 9人の立ち絵は同一の正方形・胸上構図で統一し、VOICEVOX公式キャラクターや既存著作物を描かず、声の印象と独自人格だけを題材に生成した。
