'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterProfile } from '@/domain/characters';
import type { Role, SeatId } from '@/domain/types';

const roles: Array<{ key: Role; label: string }> = [
  { key: 'villager', label: '村人' },
  { key: 'werewolf', label: '人狼' },
  { key: 'seer', label: '占い師' },
  { key: 'medium', label: '霊媒師' },
  { key: 'bodyguard', label: '狩人' },
  { key: 'madman', label: '狂人' },
];

const clone = <T,>(value: T): T => structuredClone(value);

export function CharacterEditor() {
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<SeatId>('seat-1');
  const [draft, setDraft] = useState<CharacterProfile | null>(null);
  const [saved, setSaved] = useState<CharacterProfile | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const dirty = useMemo(() => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)), [draft, saved]);

  useEffect(() => {
    void fetch('/api/characters', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { characters?: CharacterProfile[]; error?: { message?: string } };
        if (!response.ok || !data.characters) throw new Error(data.error?.message ?? '読み込めませんでした。');
        setCharacters(data.characters);
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

  const loadPortrait = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('PNG・JPEG・WebP画像を選んでください。'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('立ち絵は2MB以下にしてください。'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') update('portraitSrc', reader.result); };
    reader.readAsDataURL(file);
  };

  const exportPreset = () => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${draft.name.replaceAll(/\s+/g, '-')}.character.json`; anchor.click();
    URL.revokeObjectURL(url);
  };

  const importPreset = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !draft) return;
    void file.text().then((text) => {
      const imported = JSON.parse(text) as CharacterProfile;
      setDraft({ ...imported, seat: draft.seat, voice: { ...imported.voice, seat: draft.seat } });
      setStatus('プリセットを読み込みました。内容を確認して保存してください。'); setError('');
    }).catch(() => setError('JSONプリセットを読み込めませんでした。'));
  };

  if (!draft) return <main className="character-editor-loading">{error || 'キャラクター設定を読み込み中…'}</main>;

  return (
    <main className="character-editor-shell">
      <header className="character-editor-header">
        <div><Link href="/" className="mini-logo"><span>AI</span>人狼</Link><span className="section-kicker">CHARACTER STUDIO</span><h1>キャラクター編集</h1><p>ここでの変更は次の新規試合から反映され、過去の試合とリプレイは変わりません。</p></div>
        <Link href="/" className="editor-back">× 閉じる</Link>
      </header>

      <div className="character-editor-layout">
        <nav className="character-roster" aria-label="編集するキャラクター">
          {characters.map((character, index) => <button className={character.seat === selectedSeat ? 'active' : ''} key={character.seat} onClick={() => choose(character.seat)}>
            <Image src={character.portraitSrc} width={52} height={52} alt="" unoptimized={character.portraitSrc.startsWith('data:')} />
            <span><small>SEAT {String(index + 1).padStart(2, '0')}</small><strong>{character.name}</strong><em>{character.title}</em></span>
          </button>)}
        </nav>

        <form className="character-form" onSubmit={save}>
          <section className="character-preview">
            <Image src={draft.portraitSrc} width={220} height={220} alt={`${draft.name}の立ち絵`} unoptimized={draft.portraitSrc.startsWith('data:')} />
            <div><span>SEAT {draft.seat.split('-')[1]}</span><h2>{draft.name}</h2><p>{draft.title}</p><label className="portrait-upload">立ち絵を選択<input type="file" accept="image/png,image/jpeg,image/webp" onChange={loadPortrait} /></label><small>PNG・JPEG・WebP / 2MBまで</small></div>
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

          <section className="editor-section"><div className="editor-section-head"><span>04</span><div><h2>立ち絵と音声</h2><p>VOICEVOXの話者IDと表示名を設定します。</p></div></div><div className="editor-fields two-column">
            <label>VOICEVOX話者ID<input type="number" min="0" value={draft.voice.speakerId} onChange={(event) => update('voice', { ...draft.voice, speakerId: Number(event.target.value) })} /></label>
            <label>話者名<input value={draft.voice.speakerName} onChange={(event) => update('voice', { ...draft.voice, speakerName: event.target.value })} /></label>
            <label>スタイル名<input value={draft.voice.styleName} onChange={(event) => update('voice', { ...draft.voice, styleName: event.target.value })} /></label>
            <label>声の表現<select value={draft.voice.presentation} onChange={(event) => update('voice', { ...draft.voice, presentation: event.target.value as CharacterProfile['voice']['presentation'] })}><option value="female">女性的</option><option value="male">男性的</option><option value="androgynous">中性的</option></select></label>
            <label className="full-width">ビジュアル設定<textarea value={draft.visualBrief} onChange={(event) => update('visualBrief', event.target.value)} /><small>将来の立ち絵再生成用メモです。</small></label>
          </div></section>

          <details className="editor-advanced"><summary><span>05</span><div><strong>役職別の行動方針</strong><small>6役職それぞれの発言・投票・夜行動</small></div></summary><div className="editor-fields">
            {roles.map((role) => <label key={role.key}>{role.label}<textarea value={draft.roleBehaviors[role.key]} onChange={(event) => update('roleBehaviors', { ...draft.roleBehaviors, [role.key]: event.target.value })} /></label>)}
          </div></details>

          <details className="editor-advanced"><summary><span>06</span><div><strong>他の8人への呼び方</strong><small>名前、苗字、さん・ちゃん付け、呼び捨てを個別設定</small></div></summary><div className="editor-fields two-column">
            {characters.filter((character) => character.seat !== draft.seat).map((character) => <label key={character.seat}>{character.name}<input value={draft.addressBook[character.seat] ?? ''} onChange={(event) => update('addressBook', { ...draft.addressBook, [character.seat]: event.target.value })} /></label>)}
          </div></details>

          {(status || error) && <div className={`editor-message ${error ? 'error' : 'success'}`} role="status">{error || status}</div>}
          <footer className="editor-actions">
            <div><button type="button" onClick={exportPreset}>JSON書き出し</button><button type="button" onClick={() => importRef.current?.click()}>JSON読み込み</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={importPreset} /><button type="button" className="reset" onClick={() => void reset()}>初期設定に戻す</button></div>
            <button className="save" type="submit" disabled={saving || !dirty}>{saving ? '保存中…' : dirty ? '変更を保存' : '保存済み'}</button>
          </footer>
        </form>
      </div>
    </main>
  );
}
