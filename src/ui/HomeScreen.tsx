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
  const [settingsReady, setSettingsReady] = useState(false);
  const [error, setError] = useState('');
  const [confirmingAbortId, setConfirmingAbortId] = useState<string | null>(null);
  const [abortingMatchId, setAbortingMatchId] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<'mock' | 'real'>('mock');
  const { bgmEnabled, setBgmEnabled, bgmVolume, setBgmVolume } = useAmbientBgm('night');

  const refresh = async () => {
    try {
      const response = await fetch('/api/matches', { cache: 'no-store' });
      if (!response.ok) throw new Error('試合設定を読み込めませんでした。');
      const data = await response.json() as {
        matches: UiMatch[];
        aiProvider?: 'mock' | 'real';
      };
      setMatches(data.matches);
      setAiProvider(data.aiProvider ?? 'mock');
      setSettingsReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '試合設定を読み込めませんでした。');
    }
  };
  useEffect(() => { void refresh(); }, []);

  const start = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed, speed }),
      });
      const data = await response.json() as { id?: string; error?: { message: string } };
      if (!response.ok || !data.id) throw new Error(data.error?.message ?? '開始できませんでした。');
      const matchResponse = await fetch(`/api/match/${data.id}?view=public`, { cache: 'no-store' });
      if (!matchResponse.ok) throw new Error('作成した試合を読み込めませんでした。');
      window.sessionStorage.setItem('werewolf-new-match', data.id);
      window.location.href = `/match/${data.id}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '開始できませんでした。'); setLoading(false); }
  };

  const abortMatch = async (match: UiMatch) => {
    setAbortingMatchId(match.id);
    setError('');
    try {
      const response = await fetch(`/api/match/${match.id}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abort' }),
      });
      const data = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(data.error?.message ?? '試合を強制終了できませんでした。');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '試合を強制終了できませんでした。');
    } finally {
      setAbortingMatchId(null);
      setConfirmingAbortId(null);
    }
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

      <div className="home-audio-row"><span className={`provider-pill ${aiProvider}`}>{aiProvider === 'real' ? '● CHARACTER REAL AI' : '○ MOCK AI'}</span><AudioControls compact bgmEnabled={bgmEnabled} bgmVolume={bgmVolume} onBgmChange={setBgmEnabled} onBgmVolumeChange={setBgmVolume} /></div>

      <section className="launch-grid">
        <form className="start-card" onSubmit={start}>
          <div className="section-kicker">NEW MATCH</div><h2>新しい試合を始める</h2>
          <label>SEED <small>空欄なら自動生成</small><input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="例: village-2026" maxLength={80} /></label>
          <fieldset><legend>進行速度</legend><div className="speed-options">
            {[{ value: 3000, label: 'ゆっくり', note: '3秒' }, { value: 1500, label: '標準', note: '1.5秒' }, { value: 0, label: '最速', note: '0秒' }].map((item) => (
              <label className={speed === item.value ? 'selected' : ''} key={item.value}><input type="radio" name="speed" value={item.value} checked={speed === item.value} onChange={() => setSpeed(item.value)} /><strong>{item.label}</strong><span>{item.note}</span></label>
            ))}
          </div></fieldset>
          <button className="primary-button" disabled={loading || !settingsReady}>{loading ? '村を準備中…' : settingsReady ? 'AI人狼を開始' : '設定を読み込み中…'} <span>→</span></button>
          <Link className="character-settings-link" href="/characters"><span>⚙</span><strong>キャラクターを編集</strong><small>人格・立ち絵・LLM・推論・TTSを個別設定</small></Link>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="mock-note">LLM・推論レベル・TTSは、9人それぞれの保存済みキャラクター設定を使用します。変更は「キャラクターを編集」から行えます。{aiProvider === 'real' && ' 実AIのAPI利用料金が発生します。'}</p>
        </form>

        <section className="history-card">
          <div className="history-head"><div><div className="section-kicker">ARCHIVE</div><h2>試合記録</h2></div><button className="icon-button" onClick={() => void refresh()} aria-label="一覧を更新">↻</button></div>
          <div className="match-list">
            {matches.length === 0 && <div className="empty-state"><span>◌</span><p>まだ試合がありません</p></div>}
            {matches.map((match) => (
              <article className="match-row" key={match.id}>
                <div className={`status-orb ${match.status}`} /><div className="match-summary"><strong>{new Date(match.createdAt).toLocaleString('ja-JP')}</strong><span>seed: {match.seed}</span></div>
                <div className="match-result"><span>{statusLabel[match.status] ?? match.status}</span><strong>{match.winner ? winnerLabel[match.winner] : '—'}</strong></div>
                <div className="match-actions">
                  <Link href={match.status === 'finished' ? `/replay/${match.id}` : `/match/${match.id}`}>{match.status === 'finished' ? 'リプレイ' : '観戦'} →</Link>
                  {match.status === 'running' && (confirmingAbortId === match.id
                    ? <div className="force-abort-confirm" aria-label={`seed ${match.seed} の強制終了確認`}>
                      <button className="force-abort-button" disabled={abortingMatchId === match.id} onClick={() => void abortMatch(match)}>{abortingMatchId === match.id ? '終了中…' : '終了する'}</button>
                      <button className="force-abort-cancel" disabled={abortingMatchId === match.id} onClick={() => setConfirmingAbortId(null)}>取消</button>
                    </div>
                    : <button className="force-abort-button" onClick={() => setConfirmingAbortId(match.id)}>強制終了</button>)}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
      <footer className="site-footer"><span>AI WEREWOLF / LOCAL OBSERVATION SYSTEM</span><span>Standard 9-player rules · Event-sourced replay</span></footer>
    </main>
  );
}
