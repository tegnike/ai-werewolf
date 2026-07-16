'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { UiMatch } from './types';
import { AudioControls } from './AudioControls';
import { useAmbientBgm } from './useAmbientBgm';

const statusLabel: Record<string, string> = {
  running: '進行中', paused: '一時停止', paused_error: 'エラー停止', finished: '終了', aborted: '中断', aborted_budget: '上限停止',
};
const winnerLabel: Record<string, string> = { village: '村人陣営', werewolf: '人狼陣営', draw: '引き分け' };

export function HomeScreen() {
  const [matches, setMatches] = useState<UiMatch[]>([]);
  const [seed, setSeed] = useState('');
  const [speed, setSpeed] = useState(1500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiProvider, setAiProvider] = useState<'mock' | 'real'>('mock');
  const { bgmEnabled, setBgmEnabled, bgmVolume, setBgmVolume } = useAmbientBgm('night');

  const refresh = async () => {
    const response = await fetch('/api/matches', { cache: 'no-store' });
    const data = await response.json() as { matches: UiMatch[]; aiProvider?: 'mock' | 'real' };
    setMatches(data.matches);
    setAiProvider(data.aiProvider ?? 'mock');
  };
  useEffect(() => { void refresh(); }, []);

  const start = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch('/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed, speed }) });
      const data = await response.json() as { id?: string; error?: { message: string } };
      if (!response.ok || !data.id) throw new Error(data.error?.message ?? '開始できませんでした。');
      window.location.href = `/match/${data.id}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '開始できませんでした。'); setLoading(false); }
  };

  return (
    <main className="home-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse-dot" /> 9 AI AGENTS · ONE VILLAGE</div>
          <h1><span>AI</span>人狼</h1>
          <p className="hero-lead">9体のAIが、推理し、疑い、騙し、投票する。<br />あなたは結末まで見届ける観戦者です。</p>
          <div className="role-chips"><span>村人 ×3</span><span>人狼 ×2</span><span>占い師</span><span>霊媒師</span><span>狩人</span><span>狂人</span></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="moon" /><div className="table-ring">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div></div>
      </section>

      <div className="home-audio-row"><span className={`provider-pill ${aiProvider}`}>{aiProvider === 'real' ? '● OPENAI REAL AI' : '○ MOCK AI'}</span><AudioControls compact bgmEnabled={bgmEnabled} bgmVolume={bgmVolume} onBgmChange={setBgmEnabled} onBgmVolumeChange={setBgmVolume} /></div>

      <section className="launch-grid">
        <form className="start-card" onSubmit={start}>
          <div className="section-kicker">NEW MATCH</div><h2>新しい試合を始める</h2>
          <label>SEED <small>空欄なら自動生成</small><input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="例: village-2026" maxLength={80} /></label>
          <fieldset><legend>進行速度</legend><div className="speed-options">
            {[{ value: 3000, label: 'ゆっくり', note: '3秒' }, { value: 1500, label: '標準', note: '1.5秒' }, { value: 0, label: '最速', note: '0秒' }].map((item) => (
              <label className={speed === item.value ? 'selected' : ''} key={item.value}><input type="radio" name="speed" value={item.value} checked={speed === item.value} onChange={() => setSpeed(item.value)} /><strong>{item.label}</strong><span>{item.note}</span></label>
            ))}
          </div></fieldset>
          <button className="primary-button" disabled={loading}>{loading ? '村を準備中…' : 'AI人狼を開始'} <span>→</span></button>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="mock-note">現在の思考エンジン: <strong>{aiProvider === 'real' ? 'OpenAI gpt-5.6-luna（API利用料金が発生）' : '決定論的MockAI'}</strong></p>
        </form>

        <section className="history-card">
          <div className="history-head"><div><div className="section-kicker">ARCHIVE</div><h2>試合記録</h2></div><button className="icon-button" onClick={() => void refresh()} aria-label="一覧を更新">↻</button></div>
          <div className="match-list">
            {matches.length === 0 && <div className="empty-state"><span>◌</span><p>まだ試合がありません</p></div>}
            {matches.map((match) => (
              <article className="match-row" key={match.id}>
                <div className={`status-orb ${match.status}`} /><div className="match-summary"><strong>{new Date(match.createdAt).toLocaleString('ja-JP')}</strong><span>seed: {match.seed}</span></div>
                <div className="match-result"><span>{statusLabel[match.status] ?? match.status}</span><strong>{match.winner ? winnerLabel[match.winner] : '—'}</strong></div>
                <Link href={match.status === 'finished' ? `/replay/${match.id}` : `/match/${match.id}`}>{match.status === 'finished' ? 'リプレイ' : '観戦'} →</Link>
              </article>
            ))}
          </div>
        </section>
      </section>
      <footer className="site-footer"><span>AI WEREWOLF / LOCAL OBSERVATION SYSTEM</span><span>Standard 9-player rules · Event-sourced replay</span></footer>
    </main>
  );
}
