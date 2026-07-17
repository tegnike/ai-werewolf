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
| `agents/agent_1.png` | 名取 澪の立ち絵 | 琥珀色を差し色にした赤褐色ボブの成人女性、世話焼きの心配性 |
| `agents/agent_2.png` | 八木 こはるの立ち絵 | ライム色を差し色にした淡い緑の短髪、中性的なお調子者 |
| `agents/agent_3.png` | 宮下 さくらの立ち絵 | 空色を差し色にした茶色のポニーテールの若い女性、人好きな寂しがり屋 |
| `agents/agent_4.png` | 雨宮 しずくの立ち絵 | ミント色を差し色にした濃い青緑髪の成人女性、考えすぎる慎重派 |
| `agents/agent_5.png` | 神崎 レナの立ち絵 | ローズ色を差し色にした長い深紅髪の成人女性、負けず嫌いな自信家 |
| `agents/agent_6.png` | 黒田 剛の立ち絵 | 黄土色を差し色にした黒い短髪の成人男性、愛想のない現実主義者 |
| `agents/agent_7.png` | 真壁 陽太の立ち絵 | オレンジを差し色にした砂色の無造作髪の若い男性、惚れっぽい熱血漢 |
| `agents/agent_8.png` | 青木 征司の立ち絵 | コバルトを差し色にした濃紺の撫で付け髪の壮年男性、仕切りたがりの苦労人 |
| `agents/agent_9.png` | 久遠 ひよりの立ち絵 | シアンを差し色にした紫がかった黒髪の若い女性、臆病な言葉の収集家 |
| `bgm_village.ogg` | 環境BGM | ffmpegの合成音源から生成した24秒のオリジナル・ステレオループ。外部素材不使用 |

## CC0効果音

取得日: 2026-07-17

配布者: Kenney Vleugels（Kenney.nl）

ライセンス: Creative Commons Zero（CC0 1.0 Universal）

| 格納ファイル | 元パック | 元ファイル | 用途 |
|---|---|---|---|
| `sfx_scene_change.ogg` | RPG Audio 1.0 | `doorClose_4.ogg` | 日替わり、処刑なしの低い切替音 |
| `sfx_vote.ogg` | UI Audio 1.0 | `switch23.ogg` | 開票、決選開票 |
| `sfx_attack.ogg` | RPG Audio 1.0 | `knifeSlice2.ogg` | 襲撃犠牲者の公開 |
| `sfx_execution.ogg` | RPG Audio 1.0 | `chop.ogg` | 処刑者の公開 |

配布ページは `https://kenney.nl/assets/ui-audio` と `https://kenney.nl/assets/rpg-audio`。音源は無加工でファイル名だけ変更した。

### BGM生成条件

- 55Hz〜440Hzの正弦波を左右で位相差を付けて合成し、低域パルスと4秒周期の高音レイヤーを加えた。
- 24秒、48kHz、2chのOgg Vorbis。平均音量は約-18.6dB、最大音量は約-7.9dB。
- 外部の楽曲、サンプル、MIDI、録音素材は使用していない。

## 最終補正

- 役職画像は、村人以外まで人狼に見える初稿を採用せず、人間役職4点を再生成した。
- OGP初稿の人数誤差を採用せず、最終画像は座席シルエット9体を目視確認した。
- 全画像に文字、透かし、ロゴ、既存製品固有の意匠がないことを目視確認した。
- UI格納時に役職画像を768×768px、背景とOGPを1920×1080pxへ縮小した。
- 9人の立ち絵は同一の正方形・胸上構図で統一し、VOICEVOX公式キャラクターや既存著作物を描かず、声の印象と独自人格だけを題材に生成した。
