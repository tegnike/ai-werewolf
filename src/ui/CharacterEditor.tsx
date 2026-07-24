'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChangeEvent, DragEvent as ReactDragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterAddressStyle, CharacterProfile } from '@/domain/characters';
import { formatCharacterPresetErrors, parseCharacterPresetJson } from '@/domain/character-preset-validation';
import {
  GEMINI_MODELS, GEMINI_THINKING_BUDGET_PRESETS, GEMINI_THINKING_LEVELS, OPENAI_REASONING_EFFORTS,
} from '@/domain/types';
import type {
  GeminiThinkingBudget, GeminiThinkingLevel, LlmProvider, OpenAiReasoningEffort, Role, SeatId, TtsProvider,
} from '@/domain/types';

const roles: Array<{ key: Role; label: string }> = [
  { key: 'villager', label: '村人' },
  { key: 'werewolf', label: '人狼' },
  { key: 'seer', label: '占い師' },
  { key: 'medium', label: '霊媒師' },
  { key: 'bodyguard', label: '狩人' },
  { key: 'madman', label: '狂人' },
];

const addressStyles: Array<{ value: CharacterAddressStyle; label: string }> = [
  { value: 'full_name_san', label: '表示名＋さん（例: 天満 ひなたさん）' },
  { value: 'family_name_san', label: '名字＋さん（例: 天満さん）' },
  { value: 'given_name_san', label: '下の名前＋さん（例: ひなたさん）' },
  { value: 'full_name', label: '表示名をそのまま（例: 天満 ひなた）' },
  { value: 'family_name', label: '名字を呼び捨て（例: 天満）' },
  { value: 'given_name', label: '下の名前を呼び捨て（例: ひなた）' },
  { value: 'given_name_chan', label: '下の名前＋ちゃん（例: ひなたちゃん）' },
  { value: 'given_name_kun', label: '下の名前＋くん（例: ひなたくん）' },
];

const clone = <T,>(value: T): T => structuredClone(value);

export function CharacterEditor() {
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [llmModels, setLlmModels] = useState<Record<LlmProvider, readonly string[]>>({
    openai: ['gpt-5.6-luna'],
    gemini: GEMINI_MODELS,
  });
  const [selectedSeat, setSelectedSeat] = useState<SeatId>('seat-1');
  const [draft, setDraft] = useState<CharacterProfile | null>(null);
  const [saved, setSaved] = useState<CharacterProfile | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [portraitDragActive, setPortraitDragActive] = useState(false);
  const [presetDragActive, setPresetDragActive] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const dirty = useMemo(() => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)), [draft, saved]);

  useEffect(() => {
    void fetch('/api/characters', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as {
          characters?: CharacterProfile[];
          customizedSeats?: SeatId[];
          llmModels?: Record<LlmProvider, string[]>;
          error?: { message?: string };
        };
        if (!response.ok || !data.characters) throw new Error(data.error?.message ?? '読み込めませんでした。');
        setCharacters(data.characters);
        if (data.llmModels) setLlmModels(data.llmModels);
        const first = data.characters[0];
        if (first) { setSelectedSeat(first.seat); setDraft(clone(first)); setSaved(clone(first)); }
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '読み込めませんでした。'));
  }, []);

  const choose = (seat: SeatId) => {
    if (seat === selectedSeat) return;
    if (dirty && !window.confirm('保存していない変更を破棄してキャラを切り替えますか？')) return;
    const selected = characters.find((character) => character.seat === seat);
    if (!selected) return;
    setSelectedSeat(seat); setDraft(clone(selected)); setSaved(clone(selected)); setStatus(''); setError('');
  };

  const update = <K extends keyof CharacterProfile>(key: K, value: CharacterProfile[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const updateGeminiThinkingLevel = (thinkingLevel: GeminiThinkingLevel) => {
    setDraft((current) => {
      if (!current || current.llm.provider !== 'gemini' || current.llm.model === 'gemini-2.5-pro') return current;
      return { ...current, llm: { ...current.llm, thinkingLevel } };
    });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError(''); setStatus('');
    try {
      const response = await fetch('/api/characters', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character: draft }),
      });
      const data = await response.json() as { character?: CharacterProfile; error?: { message?: string } };
      if (!response.ok || !data.character) throw new Error(data.error?.message ?? '保存できませんでした。');
      const next = data.character;
      setCharacters((current) => current.map((character) => character.seat === next.seat ? next : character));
      setDraft(clone(next)); setSaved(clone(next)); setStatus(`${next.name}の設定を保存しました。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
    } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!draft || !window.confirm(`${draft.name}を初期設定へ戻しますか？`)) return;
    setSaving(true); setError(''); setStatus('');
    try {
      const response = await fetch('/api/characters', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: draft.seat }),
      });
      const data = await response.json() as { character?: CharacterProfile; error?: { message?: string } };
      if (!response.ok || !data.character) throw new Error(data.error?.message ?? '初期化できませんでした。');
      setCharacters((current) => current.map((character) => character.seat === data.character!.seat ? data.character! : character));
      setDraft(clone(data.character)); setSaved(clone(data.character)); setStatus('初期設定へ戻しました。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '初期化できませんでした。');
    } finally { setSaving(false); }
  };

  const applyPortraitFile = (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('PNG・JPEG・WebP画像を選んでください。'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('立ち絵は2MB以下にしてください。'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') update('portraitSrc', reader.result); };
    reader.onerror = () => setError('立ち絵を読み込めませんでした。');
    reader.readAsDataURL(file);
  };

  const loadPortrait = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) applyPortraitFile(file);
  };

  const dropPortrait = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setPortraitDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) applyPortraitFile(file);
  };

  const exportPreset = () => {
    if (!draft) return;
    const portable = {
      ...draft,
      seat: '',
      addressBook: {},
      tts: { ...draft.tts, voice: { ...draft.tts.voice, seat: '' } },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${draft.name.replaceAll(/\s+/g, '-')}.character.json`; anchor.click();
    URL.revokeObjectURL(url);
  };

  const applyPresetFile = (file: File) => {
    if (!draft) return;
    if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
      setStatus('');
      setError('JSONファイルを選んでください。');
      return;
    }
    void file.text().then((text) => {
      const targetSeat = draft.seat;
      const result = parseCharacterPresetJson(text, { targetSeat, existingCharacters: characters });
      if (!result.success) {
        setStatus('');
        setError(`JSONプリセットに${result.errors.length}件の問題があります。\n${formatCharacterPresetErrors(result.errors)}`);
        return;
      }
      const targetSaved = characters.find((character) => character.seat === targetSeat);
      if (!targetSaved) throw new Error('取り込み先の保存枠が見つかりません。');
      setSaved(clone(targetSaved));
      setDraft(result.character);
      setStatus(result.seatWasUnassigned
        ? `席未指定のプリセットを選択中のSLOT ${targetSeat.split('-')[1]}へ取り込みました。試合での席は開始時に決まります。内容を確認して保存してください。`
        : 'プリセットを読み込みました。内容を確認して保存してください。');
      setError('');
    }).catch((cause) => {
      setStatus('');
      setError(`JSONプリセットを読み込めませんでした: ${cause instanceof Error ? cause.message : '不明なエラー'}`);
    });
  };

  const importPreset = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) applyPresetFile(file);
  };

  const dropPreset = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setPresetDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) applyPresetFile(file);
  };

  if (!draft) return <main className="character-editor-loading">{error || 'キャラクター設定を読み込み中…'}</main>;

  return (
    <main className="character-editor-shell">
      <header className="character-editor-header">
        <div><Link href="/" className="mini-logo"><span>AI</span>人狼</Link><span className="section-kicker">CHARACTER STUDIO</span><h1>キャラクター編集</h1><p>SLOTは編集用の保存枠です。実際の席は試合開始時に決まり、過去の試合とリプレイは変わりません。</p></div>
        <Link href="/" className="editor-back">× 閉じる</Link>
      </header>

      <div className="character-editor-layout">
        <nav className="character-roster" aria-label="編集するキャラクター">
          {characters.map((character, index) => <button className={character.seat === selectedSeat ? 'active' : ''} key={character.seat} onClick={() => choose(character.seat)}>
            <Image src={character.portraitSrc} width={52} height={52} alt="" unoptimized={character.portraitSrc.startsWith('data:')} />
            <span><small>SLOT {String(index + 1).padStart(2, '0')}</small><strong>{character.name}</strong><em>{character.title}</em></span>
          </button>)}
        </nav>

        <form className="character-form" onSubmit={save}>
          <section
            className={`character-preview portrait-drop-zone${portraitDragActive ? ' drag-active' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setPortraitDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setPortraitDragActive(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPortraitDragActive(false); }}
            onDrop={dropPortrait}
          >
            <Image src={draft.portraitSrc} width={220} height={220} alt={`${draft.name}の立ち絵`} unoptimized={draft.portraitSrc.startsWith('data:')} />
            <div><span>SLOT {draft.seat.split('-')[1]}</span><h2>{draft.name}</h2><p>{draft.title}</p><label className="portrait-upload">立ち絵を選択<input type="file" accept="image/png,image/jpeg,image/webp" onChange={loadPortrait} /></label><small>PNG・JPEG・WebP / 2MBまで / このエリアへドロップ可</small></div>
          </section>

          <section className="editor-section"><div className="editor-section-head"><span>01</span><div><h2>基本情報</h2><p>画面表示とキャラクターの自己認識に使います。</p></div></div><div className="editor-fields two-column">
            <label>名前<input value={draft.name} maxLength={40} onChange={(event) => update('name', event.target.value)} /></label>
            <label>肩書き<input value={draft.title} maxLength={120} onChange={(event) => update('title', event.target.value)} /></label>
            <label>一人称<input value={draft.firstPerson} maxLength={16} onChange={(event) => update('firstPerson', event.target.value)} /></label>
            <label>役職を名乗る台詞<input value={draft.roleClaimTemplate} maxLength={120} onChange={(event) => update('roleClaimTemplate', event.target.value)} /><small><code>{'{role}'}</code> の位置に「占い師」または「霊媒師」が入ります。</small></label>
          </div></section>

          <section className="editor-section"><div className="editor-section-head"><span>02</span><div><h2>人格と判断</h2><p>口調だけでなく、誰を信じ、どの情報を重く見るかを決めます。</p></div></div><div className="editor-fields">
            <label>根本欲求<textarea value={draft.coreDrive} onChange={(event) => update('coreDrive', event.target.value)} /></label>
            <label>内面の矛盾と欠点<textarea value={draft.contradiction} onChange={(event) => update('contradiction', event.target.value)} /></label>
            <label>対人バイアス<textarea value={draft.socialBias} onChange={(event) => update('socialBias', event.target.value)} /></label>
            <label>感情の引き金と回復<textarea value={draft.emotionalPattern} onChange={(event) => update('emotionalPattern', event.target.value)} /></label>
            <label>判断の癖<textarea value={draft.decisionHabit} onChange={(event) => update('decisionHabit', event.target.value)} /></label>
            <label>避ける判断・話し方<textarea value={draft.antiStyle} onChange={(event) => update('antiStyle', event.target.value)} /></label>
          </div></section>

          <section className="editor-section"><div className="editor-section-head"><span>03</span><div><h2>話し方</h2><p>台詞のリズム、長さ、敬体・常体などの演技を指定します。</p></div></div><div className="editor-fields">
            <label>話し方<textarea value={draft.speechStyle} onChange={(event) => update('speechStyle', event.target.value)} /></label>
            <label>台詞の見本<textarea value={draft.exampleLine} maxLength={500} onChange={(event) => update('exampleLine', event.target.value)} /></label>
            <label>発言量<input value={draft.lengthGuide} onChange={(event) => update('lengthGuide', event.target.value)} /></label>
            <label>演技の核<textarea value={draft.performanceAnchor} onChange={(event) => update('performanceAnchor', event.target.value)} /></label>
          </div></section>

          <section className="editor-section"><div className="editor-section-head"><span>04</span><div><h2>AIと音声</h2><p>このキャラクターが使用するLLM・推論設定・TTSと、それぞれの話者を設定します。</p></div></div><div className="editor-fields two-column">
            <h3 className="voice-provider-heading">キャラクター実行設定</h3>
            <label>言語モデル<select aria-label="キャラクターの言語モデル" value={draft.llm.provider} onChange={(event) => update('llm', event.target.value === 'gemini' ? { provider: 'gemini', model: 'gemini-2.5-pro', thinkingBudget: -1 } : { provider: 'openai', reasoningEffort: 'low' })}><option value="openai">OpenAI — {llmModels.openai[0]}</option><option value="gemini">Gemini</option></select></label>
            <label>音声エンジン<select aria-label="キャラクターの音声エンジン" value={draft.tts.provider} onChange={(event) => update('tts', { provider: event.target.value as TtsProvider, voice: draft.tts.voice } as CharacterProfile['tts'])}><option value="voicevox">VOICEVOX</option><option value="aivisspeech">AivisSpeech</option></select></label>
            {draft.llm.provider === 'gemini' && <label className="full-width">Geminiモデル<select aria-label="キャラクターのGeminiモデル" value={draft.llm.model} onChange={(event) => update('llm', event.target.value === 'gemini-3.6-flash' ? { provider: 'gemini', model: 'gemini-3.6-flash', thinkingLevel: 'medium' } : event.target.value === 'gemini-3.5-flash-lite' ? { provider: 'gemini', model: 'gemini-3.5-flash-lite', thinkingLevel: 'minimal' } : { provider: 'gemini', model: 'gemini-2.5-pro', thinkingBudget: -1 })}>{llmModels.gemini.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>}
            {draft.llm.provider === 'openai'
              ? <label className="full-width">OpenAI推論レベル<select aria-label="キャラクターのOpenAI推論レベル" value={draft.llm.reasoningEffort} onChange={(event) => update('llm', { provider: 'openai', reasoningEffort: event.target.value as OpenAiReasoningEffort })}>{OPENAI_REASONING_EFFORTS.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label>
              : draft.llm.model !== 'gemini-2.5-pro'
                ? <label className="full-width">Gemini思考レベル<select aria-label="キャラクターのGemini思考レベル" value={draft.llm.thinkingLevel} onChange={(event) => updateGeminiThinkingLevel(event.target.value as GeminiThinkingLevel)}>{GEMINI_THINKING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
                : <label className="full-width">Gemini思考トークン予算<select aria-label="キャラクターのGemini思考トークン予算" value={draft.llm.thinkingBudget} onChange={(event) => update('llm', { provider: 'gemini', model: 'gemini-2.5-pro', thinkingBudget: Number(event.target.value) as GeminiThinkingBudget })}>{GEMINI_THINKING_BUDGET_PRESETS.map((budget) => <option key={budget} value={budget}>{budget === -1 ? '自動（モデル既定）' : `${budget.toLocaleString('ja-JP')} tokens`}</option>)}</select></label>}
            <small className="full-width execution-settings-note">LLMとTTSは試合全体ではなく、このキャラクター専用です。APIキーはサーバー側のOpenAI・Gemini共通設定を使用し、JSONへは含めません。</small>
            <h3 className="voice-provider-heading">{draft.tts.provider === 'voicevox' ? 'VOICEVOX' : 'AivisSpeech'}</h3>
            <label>{draft.tts.provider === 'voicevox' ? '話者ID' : 'スタイルID'}<input type="number" min="0" value={draft.tts.voice.speakerId} onChange={(event) => update('tts', { ...draft.tts, voice: { ...draft.tts.voice, speakerId: Number(event.target.value) } })} /></label>
            <label>話者名<input value={draft.tts.voice.speakerName} onChange={(event) => update('tts', { ...draft.tts, voice: { ...draft.tts.voice, speakerName: event.target.value } })} /></label>
            <label>スタイル名<input value={draft.tts.voice.styleName} onChange={(event) => update('tts', { ...draft.tts, voice: { ...draft.tts.voice, styleName: event.target.value } })} /></label>
            <label>声の表現<select value={draft.tts.voice.presentation} onChange={(event) => update('tts', { ...draft.tts, voice: { ...draft.tts.voice, presentation: event.target.value as CharacterProfile['tts']['voice']['presentation'] } })}><option value="female">女性的</option><option value="male">男性的</option><option value="androgynous">中性的</option></select></label>
            {draft.tts.provider === 'aivisspeech' && <small className="full-width">AivisSpeechのスタイルIDは、起動中のEngineの <code>/speakers</code> またはSwagger UIで確認できます。</small>}
            <label className="full-width">ビジュアル設定<textarea value={draft.visualBrief} onChange={(event) => update('visualBrief', event.target.value)} /><small>将来の立ち絵再生成用メモです。</small></label>
          </div></section>

          <details className="editor-advanced"><summary><span>05</span><div><strong>役職主張と騙り戦略</strong><small>LLMが人格として名乗る・待つ・潜伏を選ぶための傾向</small></div></summary><div className="editor-fields">
            <p className="full-width execution-settings-note">0〜100は確率抽選ではなく、LLMへ渡す人格上の強さです。0〜19はほぼ選ばない、20〜39は非常時だけ、40〜59は状況次第、60〜79は積極的、80〜100は強く好む、を目安にします。</p>
            {([
              ['trueSeer', '真占い師', 'revealTendency', '公開意欲'],
              ['trueMedium', '真霊媒師', 'revealTendency', '公開意欲'],
            ] as const).map(([key, label, tendencyKey, tendencyLabel]) => {
              const strategy = draft.claimStrategy[key];
              return <div className="editor-fields two-column full-width" key={key}><h3 className="voice-provider-heading">{label}</h3>
                <label>{tendencyLabel}<input type="number" min="0" max="100" value={strategy[tendencyKey]} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, [tendencyKey]: Number(event.target.value) } })} /></label>
                <label>結果なしでの公開意欲<input type="number" min="0" max="100" value={strategy.emptyResultRevealTendency} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, emptyResultRevealTendency: Number(event.target.value) } })} /></label>
                <label>注目への耐性<input type="number" min="0" max="100" value={strategy.spotlightTolerance} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, spotlightTolerance: Number(event.target.value) } })} /></label>
                <label>名乗る時機<select value={strategy.timing} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, timing: event.target.value as typeof strategy.timing } })}><option value="early">早め</option><option value="responsive">公開状況へ反応</option><option value="patient">慎重に待つ</option></select></label>
                <label className="full-width">判断方針<textarea value={strategy.guidance} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, guidance: event.target.value } })} /></label>
              </div>;
            })}
            {([
              ['madman', '狂人'],
              ['werewolf', '人狼'],
            ] as const).map(([key, label]) => {
              const strategy = draft.claimStrategy[key];
              return <div className="editor-fields two-column full-width" key={key}><h3 className="voice-provider-heading">{label}の騙り</h3>
                <label>騙り意欲<input type="number" min="0" max="100" value={strategy.claimTendency} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, claimTendency: Number(event.target.value) } })} /></label>
                <label>対抗意欲<input type="number" min="0" max="100" value={strategy.counterclaimTendency} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, counterclaimTendency: Number(event.target.value) } })} /></label>
                <label>3人目以降への混雑許容<input type="number" min="0" max="100" value={strategy.crowdingTolerance} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, crowdingTolerance: Number(event.target.value) } })} /></label>
                <label>注目への耐性<input type="number" min="0" max="100" value={strategy.spotlightTolerance} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, spotlightTolerance: Number(event.target.value) } })} /></label>
                <label>追い込まれた時の騙り意欲<input type="number" min="0" max="100" value={strategy.selfPreservationTendency} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, selfPreservationTendency: Number(event.target.value) } })} /></label>
                <label>圧力への反応<select value={strategy.pressureResponse} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, pressureResponse: event.target.value as typeof strategy.pressureResponse } })}><option value="withdraw">露出を避ける</option><option value="deliberate">利益と危険を比較</option><option value="confront">正面から対抗</option></select></label>
                {key === 'werewolf' && <label>仲間側の露出への警戒<input type="number" min="0" max="100" value={draft.claimStrategy.werewolf.teamExposureConcern} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, werewolf: { ...draft.claimStrategy.werewolf, teamExposureConcern: Number(event.target.value) } })} /></label>}
                <label>好む騙り<select value={strategy.preferredRole} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, preferredRole: event.target.value as typeof strategy.preferredRole } })}><option value="seer">占い師</option><option value="medium">霊媒師</option><option value="adaptive">盤面で選ぶ</option></select></label>
                <label>名乗る時機<select value={strategy.timing} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, timing: event.target.value as typeof strategy.timing } })}><option value="early">早め</option><option value="responsive">公開状況へ反応</option><option value="patient">慎重に待つ</option></select></label>
                <label className="full-width">判断方針<textarea value={strategy.guidance} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, [key]: { ...strategy, guidance: event.target.value } })} /></label>
              </div>;
            })}
            <label>主張を維持する方針<textarea value={draft.claimStrategy.consistency} onChange={(event) => update('claimStrategy', { ...draft.claimStrategy, consistency: event.target.value })} /></label>
          </div></details>

          <details className="editor-advanced"><summary><span>06</span><div><strong>役職別の行動方針</strong><small>6役職それぞれの発言・投票・夜行動</small></div></summary><div className="editor-fields">
            {roles.map((role) => <label key={role.key}>{role.label}<textarea value={draft.roleBehaviors[role.key]} onChange={(event) => update('roleBehaviors', { ...draft.roleBehaviors, [role.key]: event.target.value })} /></label>)}
          </div></details>

          <details className="editor-advanced"><summary><span>07</span><div><strong>他の8人への呼び方</strong><small>大まかな既定ルールを選び、必要な相手だけ個別設定</small></div></summary><div className="editor-fields two-column">
            <label className="full-width">個別設定がない相手の呼び方<select aria-label="個別設定がない相手の呼び方" value={draft.defaultAddressStyle} onChange={(event) => update('defaultAddressStyle', event.target.value as CharacterAddressStyle)}>{addressStyles.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}</select><small>下の個別呼称が設定されている相手には、そちらを優先します。</small></label>
            {characters.filter((character) => character.seat !== draft.seat).map((character) => <label key={character.seat}>{character.name}<input value={draft.addressBook[character.seat] ?? ''} onChange={(event) => update('addressBook', { ...draft.addressBook, [character.seat]: event.target.value })} /></label>)}
          </div></details>

          {(status || error) && <div className={`editor-message ${error ? 'error' : 'success'}`} role="status">{error || status}</div>}
          <footer className="editor-actions">
            <div><button type="button" onClick={exportPreset}>JSON書き出し</button><button
              type="button"
              className={`preset-drop-zone${presetDragActive ? ' drag-active' : ''}`}
              onClick={() => importRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setPresetDragActive(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setPresetDragActive(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPresetDragActive(false); }}
              onDrop={dropPreset}
            ><strong>JSON読み込み</strong><small>クリックまたはドロップ</small></button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={importPreset} /><button type="button" className="reset" onClick={() => void reset()}>初期設定に戻す</button></div>
            <button className="save" type="submit" disabled={saving || !dirty}>{saving ? '保存中…' : dirty ? '変更を保存' : '保存済み'}</button>
          </footer>
        </form>
      </div>
    </main>
  );
}
