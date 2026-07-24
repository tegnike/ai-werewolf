# キャラクタープリセットJSON作成ガイド

キャラクター編集画面の「JSON書き出し」「JSON読み込み」で扱うプリセットの形式です。

既に人格を持つAIキャラクター本人へ作成を依頼する場合は、この形式ガイドと一緒に [AIキャラクター本人向け 人狼プリセット作成指示書](ai-character-preset-authoring.md) を渡してください。

## まず知っておくこと

- 1ファイルにつき1キャラクターです。9人分をまとめて読み込む形式ではありません。
- APIキーは含みません。APIキーはOpenAI・Geminiそれぞれのサーバー環境変数を使用します。
- 立ち絵、人格、役職別の行動方針、人格に基づく役職主張・騙り戦略、大まかな既定呼称、任意の個別呼称、キャラクターごとのLLM・推論設定と、選択したTTS Engineの話者設定を含みます。
- LLMとTTSはそれぞれ1つだけ選びます。選択していないプロバイダー用の推論設定や話者設定はJSONへ入れません。
- 共有用JSONでは席を決めません。`seat`関連の値を空文字にし、試合開始時にシステムが9人を配置します。
- 読み込んだだけでは保存されません。内容を確認して「保存」を押すと、次に作成する試合から反映されます。
- 進行中の試合と過去のリプレイには影響しません。

最も確実な作り方は、キャラクター編集画面で一度「JSON書き出し」し、そのファイルを複製して値を編集する方法です。書き出したJSONでは共有用に席と個別呼称が未設定になります。

## 保存前に検証する

作成したJSONは、リポジトリのルートで次のスクリプトを実行して検証してください。

```bash
npm run character:validate -- ./path/to/example.character.json
```

通常は席を指定しません。特定の保存枠へ取り込んだ後の形も確認したい場合だけ `--seat`を指定できます。

```bash
npm run character:validate -- --seat seat-3 ./path/to/example.character.json
```

複数ファイルを一度に指定することもできます。

```bash
npm run character:validate -- ./presets/character-1.json ./presets/character-2.json
```

正常な場合は `OK` と `席未定`・名前を表示して終了コード0を返します。不正な場合は `NG`、問題数、フィールドパス、理由をすべて表示して終了コード1を返します。ファイル指定や `--seat` が不正な場合は終了コード2です。

```text
NG ./broken.character.json (2件)
name: 値が短すぎるか、最小値未満です。Too small: expected string to have >=1 characters
roleClaimTemplate: 役職名の差し込み位置 {role} が必要です。
```

キャラクター編集画面の「JSON読み込み」でも同じ検証を自動実行します。問題があるJSONは編集内容へ反映せず、画面に問題数、フィールドパス、理由を表示します。画面ではさらに、現在の9人との名前重複も検出します。

## 読み込み手順

1. ホームで「キャラクターを編集」を開きます。
2. 上書きしたいキャラクターのSLOTを選びます。
3. 1キャラクター分のJSONを「JSON読み込み」へドラッグ＆ドロップします。ボタンをクリックしてファイルを選ぶこともできます。JSONは選択中のSLOTへだけ反映され、別のSLOTへ移動しません。
4. 画面上で名前、立ち絵、話者IDなどを確認します。立ち絵を変更する場合は、PNG・JPEG・WebP画像を立ち絵エリアへドラッグ＆ドロップするか、「立ち絵を選択」から指定します。
5. 「保存」を押します。

共有用JSONの空の `seat` と `tts.voice.seat` は、現在選択中の保存枠へ自動変換されます。保存枠はキャラクターを管理するためだけの場所で、試合中の席ではありません。試合開始時にはseedに基づいて9人を配置し直し、その配置を試合へスナップショット保存します。

## 完成例

次は席未定の共有用プリセットの完全な例です。文字列はキャラクターに合わせて変更できます。

```json
{
  "seat": "",
  "name": "朝倉 つむぎ",
  "firstPerson": "私",
  "title": "慎重な聞き役",
  "coreDrive": "仲間の話を最後まで聞き、納得できる結論を選びたい。",
  "contradiction": "慎重でいたい一方、沈黙が続くと焦って結論を急ぐ。",
  "socialBias": "自分の疑問へ具体的に答えた相手を信頼しやすい。",
  "emotionalPattern": "普段は穏やかだが、説明を避けられると語気が少し強くなる。",
  "speechStyle": "丁寧語を使い、短い確認を重ねてから意見を述べる。",
  "exampleLine": "すみません、その投票理由だけ、もう少し聞いてもいいですか。",
  "lengthGuide": "2〜4文。質問があるときは一度に一つだけ尋ねる。",
  "performanceAnchor": "相手の発言を一つ拾い、自分が気になった点へ静かに話を戻す。",
  "decisionHabit": "発言と投票の一貫性を比べ、説明の変化を重く見る。",
  "antiStyle": "大声の断定、全員の意見をまとめる議長口調、根拠のない決めつけを避ける。",
  "visualBrief": "落ち着いた表情。紺色のカーディガンを着た若い女性。",
  "roleClaimTemplate": "私は{role}です",
  "defaultAddressStyle": "family_name_san",
  "addressBook": {},
  "llm": {
    "provider": "openai",
    "reasoningEffort": "low"
  },
  "roleBehaviors": {
    "villager": "公開情報だけを使い、発言と投票理由の食い違いを質問する。",
    "werewolf": "村人として自然な疑問を出し、仲間だけを不自然に擁護しない。襲撃では脅威と護衛候補を比べる。",
    "seer": "占い結果を正確に扱い、名乗る時機と結果の伝え方を慎重に選ぶ。",
    "medium": "霊媒結果を正確に扱い、処刑票と翌日の反応を合わせて見る。",
    "bodyguard": "公開情報から襲撃されそうな相手を選び、連続護衛禁止を守る。",
    "madman": "人狼を知らない前提で推理し、村の判断を迷わせる主張を選ぶ。"
  },
  "claimStrategy": {
    "trueSeer": {
      "revealTendency": 78,
      "emptyResultRevealTendency": 20,
      "spotlightTolerance": 58,
      "timing": "responsive",
      "guidance": "初日中の情報公開を基本にするが、対抗や議論の要求を確認してから丁寧に名乗る。"
    },
    "trueMedium": {
      "revealTendency": 70,
      "emptyResultRevealTendency": 24,
      "spotlightTolerance": 48,
      "timing": "responsive",
      "guidance": "処刑結果が出たら抱え込みすぎず、投票理由と照合して共有する。"
    },
    "madman": {
      "claimTendency": 62,
      "counterclaimTendency": 74,
      "crowdingTolerance": 18,
      "spotlightTolerance": 52,
      "selfPreservationTendency": 60,
      "pressureResponse": "deliberate",
      "preferredRole": "seer",
      "timing": "responsive",
      "guidance": "一般的な狂人の基本として占い師騙りを有力視するが、目立つより信用を得られる時機を選ぶ。"
    },
    "werewolf": {
      "claimTendency": 24,
      "counterclaimTendency": 52,
      "crowdingTolerance": 8,
      "spotlightTolerance": 42,
      "selfPreservationTendency": 58,
      "pressureResponse": "deliberate",
      "teamExposureConcern": 78,
      "preferredRole": "adaptive",
      "timing": "patient",
      "guidance": "仲間の露出と役職主張数を見て、潜伏より信用勝負に価値がある場合だけ騙る。"
    },
    "consistency": "一度公表した役職と結果は維持し、待つと決めた場合も公開状況が変わった理由なしに方針を反転しない。"
  },
  "tts": {
    "provider": "voicevox",
    "voice": {
      "seat": "",
      "speakerId": 2,
      "speakerName": "四国めたん",
      "styleName": "ノーマル",
      "presentation": "female"
    }
  },
  "portraitSrc": "/assets/agents/agent_1.png"
}
```

`speakerId` は例示値です。実際に使用するVOICEVOXまたはAivisSpeech Engineの `/speakers` が返すスタイルIDへ置き換えてください。

## フィールド一覧

すべてのフィールドが必須です。共有用JSONでは席関連の文字列だけを意図的に空にします。

| フィールド | 最大長 | 内容 |
| --- | ---: | --- |
| `seat` | — | 共有用は空文字 `""`。取り込み後と試合スナップショットでは `seat-1`〜`seat-9`。 |
| `name` | 40文字 | 表示名。他の8人と重複できません。 |
| `firstPerson` | 16文字 | `私`、`俺`などの一人称。 |
| `title` | 120文字 | キャラクターの短い肩書き。 |
| `coreDrive` | 2,000文字 | 根本欲求、行動の目的。 |
| `contradiction` | 2,000文字 | 内面の矛盾や欠点。 |
| `socialBias` | 2,000文字 | 信頼・疑いに関する対人バイアス。 |
| `emotionalPattern` | 2,000文字 | 感情の動き方、表れ方。 |
| `speechStyle` | 2,000文字 | 敬体・常体、文の調子、口癖など。 |
| `exampleLine` | 500文字 | その人物らしい台詞例。 |
| `lengthGuide` | 300文字 | 発言量や文数の目安。 |
| `performanceAnchor` | 2,000文字 | 会話中に維持する演技の軸。 |
| `decisionHabit` | 2,000文字 | 推理、投票、判断の癖。 |
| `antiStyle` | 2,000文字 | 避ける話し方や振る舞い。 |
| `visualBrief` | 1,000文字 | 立ち絵の外見メモ。画像生成は行いません。 |
| `roleClaimTemplate` | 120文字 | 役職を名乗る文。差し込み位置 `{role}` が必須です。 |
| `defaultAddressStyle` | — | 個別呼称がない相手への大まかな呼び方。下記の8種類から選択します。 |
| `addressBook` | 各60文字 | 共有用は `{}`。参加者確定後に任意の個別呼称を設定できます。 |
| `llm` | — | OpenAIまたはGeminiのどちらか一方と、そのプロバイダー専用の推論設定。 |
| `tts` | — | VOICEVOXまたはAivisSpeechのどちらか一方と、そのEngine専用の話者設定。 |
| `roleBehaviors` | 各1,200文字 | 6役職それぞれの発言、投票、夜行動方針。 |
| `claimStrategy` | 下記参照 | 真役職の公開、狂人・人狼の騙り、対抗、作戦維持をLLMが人格として判断するための設定。 |
| `portraitSrc` | 3,000,000文字 | アプリ内アセットのパス、または画像のData URL。 |

`seat`と`tts.voice.seat`以外の文字列は空にできません。未使用にしたい項目も、キャラクターとして意味のある短い説明を入れてください。

### LLM・推論設定・TTSプロバイダー

`llm.provider`と`tts.provider`は試合全体ではなく、そのキャラクターだけに適用されます。1試合の中でOpenAIとGemini、VOICEVOXとAivisSpeechを混在できます。

- OpenAIは `"llm": { "provider": "openai", "reasoningEffort": "low" }` の形です。モデルは`gpt-5.6-luna`で、推論レベルは`none`、`low`、`medium`、`high`、`xhigh`、`max`です。
- Gemini 2.5 Proは `"llm": { "provider": "gemini", "model": "gemini-2.5-pro", "thinkingBudget": -1 }` の形です。予算は自動`-1`または128〜32768の整数です。
- Gemini 3.6 Flashは `"llm": { "provider": "gemini", "model": "gemini-3.6-flash", "thinkingLevel": "medium" }` の形です。思考レベルは`minimal`、`low`、`medium`、`high`です。
- Gemini 3.5 Flash-Liteは `"llm": { "provider": "gemini", "model": "gemini-3.5-flash-lite", "thinkingLevel": "minimal" }` の形です。思考レベルは`minimal`、`low`、`medium`、`high`です。
- `llm`は排他的なunionです。OpenAI構成へGemini用設定を、Gemini 2.5 Proへ`thinkingLevel`を、Gemini 3.6 Flash／3.5 Flash-Liteへ`thinkingBudget`を入れると検証エラーになります。
- APIキーはJSONへ記載せず、サーバー側の`OPENAI_API_KEY`と`GEMINI_API_KEY`を使用します。

### `defaultAddressStyle` と `addressBook`

共有用プリセットを作る時点では他の参加者が未定なので、個別呼称の`addressBook`は空のオブジェクト `{}` にします。その代わり`defaultAddressStyle`で、このキャラクターが他の参加者を大まかにどう呼ぶかを決めます。

| 値 | 呼び方の例（`天満 ひなた`の場合） |
| --- | --- |
| `full_name_san` | `天満 ひなたさん` |
| `family_name_san` | `天満さん` |
| `given_name_san` | `ひなたさん` |
| `full_name` | `天満 ひなた` |
| `family_name` | `天満` |
| `given_name` | `ひなた` |
| `given_name_chan` | `ひなたちゃん` |
| `given_name_kun` | `ひなたくん` |

9人の組み合わせが決まった後は、編集画面で相手ごとの名字、名前、敬称、愛称を`addressBook`へ追加できます。個別指定は`defaultAddressStyle`より優先されます。試合開始時に席が入れ替わっても、既存の呼称は相手キャラクターへ追従します。

既定キャラクターの保存枠を別キャラクターへ置き換えると、他の初期キャラクターが旧相手へ使っていた「ひなた」「ひなたちゃん」などの既定個別呼称は新しい試合から自動的に外れます。新キャラクターへの呼び方は各話者の`defaultAddressStyle`へ戻り、置き換え後に編集画面で明示設定した個別呼称だけが優先されます。

### `roleBehaviors`

次の6キーがすべて必要です。

| キー | 役職 |
| --- | --- |
| `villager` | 村人 |
| `werewolf` | 人狼 |
| `seer` | 占い師 |
| `medium` | 霊媒師 |
| `bodyguard` | 狩人 |
| `madman` | 狂人 |

一般ルール上の能力や秘密情報を増やす指示は書かないでください。たとえば、狂人が最初から人狼を知る設定や、狩人が連続護衛禁止を無視する設定は無効です。

### `claimStrategy`

`claimStrategy`は、実AIが現在の公開盤面と人格を合わせて、役職を今名乗るか、条件を決めて待つか、潜伏するかを選ぶための設定です。エンジンが最終行動を確率抽選するための値ではありません。

- `trueSeer`と`trueMedium`は、結果を持つ場合の`revealTendency`、結果がない場合の`emptyResultRevealTendency`、注目への`spotlightTolerance`、`timing`、`guidance`を持ちます。
- `madman`と`werewolf`は、0人盤面の`claimTendency`、2人目になる`counterclaimTendency`、3人目以降になる`crowdingTolerance`、`spotlightTolerance`、追い込まれた際の`selfPreservationTendency`と`pressureResponse`、`preferredRole`、`timing`、`guidance`を持ちます。
- `werewolf`だけは、仲間側の露出を増やすことへの`teamExposureConcern`も持ちます。
- `consistency`には、一度決めた非公開作戦と公表した役職・結果をどう維持する人物かを書きます。

意欲値は0〜100の整数です。実AIは乱数確率として使わず、次の共通尺度で人物傾向を解釈します。MockAIだけが決定論的な反復試験のために数値を利用します。

| 範囲 | 人格としての意味 |
| ---: | --- |
| 0〜19 | ほぼ選ばない。 |
| 20〜39 | 明確な非常時だけ選ぶ。 |
| 40〜59 | 利益と代償を具体的に比較する。 |
| 60〜79 | 条件が合えば積極的に選ぶ。 |
| 80〜100 | 人格として強く好む。 |

`counterclaimTendency`は自分が2人目になる場合だけに使います。すでに同じ役職が2人いる場合は、単なる対抗ではなく`crowdingTolerance`を優先します。これにより「対抗がいるから全員出る」という均一化を避けます。

試合中のLLMには、現在の占い師・霊媒師CO人数と、各候補を選んだ場合に自分が何人目になるかが渡されます。LLMは設定値、`guidance`、公開盤面を比較し、決定打だけを非公開の`basis`へ記録します。自由な思考過程や`basis`は公開会話・観戦画面へ出ません。

`pressureResponse`は次の3種類です。

| 値 | 意味 |
| --- | --- |
| `withdraw` | 疑いや人狼判定を受けるほど露出を避ける。 |
| `deliberate` | 騙る利益と露出の危険を比較する。 |
| `confront` | 圧力へ役職主張で正面から対抗しやすい。 |

`timing`は次の3種類です。

| 値 | 意味 |
| --- | --- |
| `early` | 最初の発言機会など早い段階を好む。 |
| `responsive` | 対抗、質問、公開結果など盤面の変化を見て動く。 |
| `patient` | 必要性が高まるまで慎重に待つ。 |

`preferredRole`は、狂人・人狼が騙る場合の初期的な好みです。

| 値 | 意味 |
| --- | --- |
| `seer` | 占い師騙りを好む。 |
| `medium` | 霊媒師騙りを好む。 |
| `adaptive` | 現在の役職主張数や人物像から選ぶ。 |

狂人の設定では、人狼が誰かを最初から知っている前提を書かないでください。人狼の設定でも狂人位置は分かりません。一般的な9人人狼として、狂人の占い師騙りが基本戦術であることは判断材料にできますが、全キャラクターを同じ数値・同じ文章へ揃えず、その人物がなぜ前へ出るか、なぜ待つかを具体的に書いてください。

### `tts`

次のどちらか一方だけを指定します。

```json
{ "provider": "voicevox", "voice": { "seat": "", "speakerId": 2, "speakerName": "四国めたん", "styleName": "ノーマル", "presentation": "female" } }
```

```json
{ "provider": "aivisspeech", "voice": { "seat": "", "speakerId": 888753760, "speakerName": "AivisSpeechの話者名", "styleName": "ノーマル", "presentation": "female" } }
```

`voice`の構造は両Engineで共通です。

| フィールド | 条件 | 内容 |
| --- | --- | --- |
| `seat` | 共有用は空文字 `""` | 取り込み時にキャラクター本体と同じ保存枠へ自動変換されます。 |
| `speakerId` | 0以上の整数 | Engineの `/speakers` が返すスタイルID。実際の音声合成に使われます。 |
| `speakerName` | 1〜80文字 | 編集画面に表示する話者名。 |
| `styleName` | 1〜80文字 | 編集画面に表示するスタイル名。 |
| `presentation` | `female`、`male`、`androgynous` | 表示上の声質区分。 |

選択していないEngineの話者ブロックは保存しません。Engineを切り替える場合は、切り替え先に実在する`speakerId`へ更新してください。

話速はJSONで個別指定せず、テンポを保つためVOICEVOX・AivisSpeechとも全キャラクター共通で`speedScale=1.1`を適用します。

## 立ち絵の指定

`portraitSrc` は次のどちらかです。

- `public/assets/` 以下に配置した画像: `/assets/characters/example.png`
- Base64を埋め込んだData URL: `data:image/png;base64,...`、`data:image/jpeg;base64,...`、`data:image/webp;base64,...`

編集画面からPNG、JPEG、WebPを選ぶとData URLへ変換されます。その状態でJSONを書き出せば画像データもJSONへ含まれるため、別ファイルを添付せずに読み込めます。画面からアップロードできる画像は2MB以下です。

`/assets/...` を指定する場合は、対応するファイルがアプリの `public/assets/...` に実在する必要があります。外部URLは使用できません。

## よくある保存エラー

- JSONの末尾カンマ、コメント、引用符の不足などで、JSONとして解析できない。
- 必須フィールドがない、または文字列が空になっている。
- `llm`または`tts`がない、選択プロバイダーと対応しない設定が入っている、または旧フラット形式のキーを使っている。
- `defaultAddressStyle`がない、または許可された8種類以外の値になっている。
- `roleClaimTemplate` に `{role}` がない。
- `claimStrategy`がない、意欲値・耐性値が0〜100の整数ではない、または`timing`・`preferredRole`・`pressureResponse`が許可値に含まれない。
- 席未定なのに `seat`または`tts.voice.seat`へ固定席を入れている。
- `addressBook` に存在しない席や自分自身の席を指定している。
- 同じ名前のキャラクターが別の席にいる。
- `portraitSrc` が `/assets/...` または対応形式のData URLではない。
- `speakerId` がEngineに存在せず、TTS生成時に音声だけが失敗する。

検証スクリプトはJSONの構文、必須項目、型、文字数、許可値、未知のフィールドを検証します。席未定のJSONは検証用の仮席へ内部変換しますが、ファイル自体は変更しません。現在保存されている他キャラクターとの名前重複と、起動中の音声Engineに `speakerId` が存在するかはCLIからは確認できません。名前重複は編集画面への読み込み時、話者IDは各Engineの `/speakers` で確認してください。

## APIから直接保存する場合

画面で読み込むファイルは上の例のようなキャラクターオブジェクトそのものです。一方、`PUT /api/characters` へ直接送る場合だけ、次のように `character` で包みます。

```json
{
  "character": {
    "seat": "seat-1",
    "name": "朝倉 つむぎ"
  }
}
```

上は包み方だけを示した省略例で、そのままでは保存できません。`character` の中には「完成例」の全必須フィールドを指定し、`seat`と`tts.voice.seat`を同じ確定席へ置き換えてください。APIへ直接送る場合は、空の席の自動割り当てを行いません。

保存後の形式の正本は [`src/domain/characters.ts`](../src/domain/characters.ts) の `characterProfileSchema`、席未定の共有ファイルを取り込む規則は [`src/domain/character-preset-validation.ts`](../src/domain/character-preset-validation.ts) です。アプリ更新後に形式が変わった場合は、編集画面から最新プリセットを書き出して差分を確認してください。
