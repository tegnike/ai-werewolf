'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { AudioControls } from './AudioControls';
import type { UiEvent, UiMatch } from './types';
import { useAmbientBgm } from './useAmbientBgm';
import { useMatchVoice } from './useMatchVoice';
import { voiceForSeat } from '@/domain/voices';
import { agentNameForSeat, personaForSeat } from '@/domain/agents';
import { presentationCursorAfterLoad, presentationLimit } from './presentation';

const roleLabel: Record<string, string> = { villager: '村人', werewolf: '人狼', seer: '占い師', medium: '霊媒師', bodyguard: '狩人', madman: '狂人' };
const phaseLabel: Record<string, string> = { setup: '準備', night_zero: '第0夜', dawn: '夜明け', discussion: '議論', vote: '投票', runoff: '決選投票', execution: '処刑', medium: '霊媒', wolf_chat: '人狼会話', night_actions: '夜の行動', finished: '終了' };
const eventLabel: Record<string, string> = { dawn: '夜明け', discussion_speech: '発言', vote_reveal: '開票', execution: '処刑', match_finished: '決着', anomaly_flag: '異常終了', werewolf_chat: '人狼会話', seer_result: '占い', medium_result: '霊媒', guard_choice: '護衛', attack_choice: '襲撃選択', night_resolved: '夜の解決', werewolf_reveal: '人狼確認', decision_note: '最終決定' };

function seatNumber(seat: unknown): number { return Number(String(seat ?? '').split('-')[1]) || 0; }
function seatName(seat: unknown): string {
  const value = seatNumber(seat);
  return value ? agentNameForSeat(`seat-${value}` as `seat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`) : 'なし';
}
function eventText(event: UiEvent): string {
  const p = event.payload;
  if (event.type === 'discussion_speech') return `${seatName(p.seat)}「${String(p.speech)}」`;
  if (event.type === 'dawn') return p.victim ? `${seatName(p.victim)}が犠牲になりました。` : '犠牲者はいません。';
  if (event.type === 'execution') return p.seat ? `${seatName(p.seat)}が処刑されました。` : '同数のため処刑はありません。';
  if (event.type === 'vote_reveal') return Object.entries((p.tally ?? {}) as Record<string, number>).map(([seat, count]) => `${seatName(seat)} ${count}票`).join(' · ');
  if (event.type === 'match_finished') return `${p.winner === 'village' ? '村人陣営' : p.winner === 'werewolf' ? '人狼陣営' : '引き分け'}で決着`;
  if (event.type === 'werewolf_chat') return `${seatName(p.seat)}「${String(p.speech)}」`;
  if (event.type.includes('result')) return `${seatName(p.targetSeat)} → ${String(p.result)}`;
  if (event.type.includes('choice')) return `${seatName(p.seat)} → ${seatName(p.targetSeat)}`;
  if (event.type === 'night_resolved') return `襲撃 ${seatName(p.attackTarget)} / 護衛 ${seatName(p.guardTarget)}`;
  return eventLabel[event.type] ?? event.type;
}

export function MatchViewer({ matchId, mode }: { matchId: string; mode: 'live' | 'replay' }) {
  const [view, setView] = useState<'public' | 'gm'>('public');
  const [match, setMatch] = useState<UiMatch | null>(null);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [cursor, setCursor] = useState(Number.MAX_SAFE_INTEGER);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [presentedSeq, setPresentedSeq] = useState(0);
  const presentationInitialized = useRef(false);
  const sourceRef = useRef<EventSource | null>(null);
  const terminal = match ? ['finished', 'aborted', 'aborted_budget'].includes(match.status) : false;
  const audioPhase = events.at(-1)?.phase ?? 'setup';
  const audioMood = ['night_zero', 'wolf_chat', 'night_actions', 'medium'].includes(audioPhase) ? 'night' : 'day';
  const { bgmEnabled, setBgmEnabled, bgmVolume, setBgmVolume, duckBgm } = useAmbientBgm(audioMood);
  const revealSpeech = useCallback((seq: number) => setPresentedSeq((current) => Math.max(current, seq)), []);
  const { voiceEnabled, setVoiceEnabled, voiceAvailable, speakingSeat, voiceVolume, setVoiceVolume, voiceBusy } = useMatchVoice(events, duckBgm, revealSpeech);

  const load = useCallback(async () => {
    const response = await fetch(`/api/match/${matchId}?view=${view}`, { cache: 'no-store' });
    const data = await response.json() as { match?: UiMatch; events?: UiEvent[]; error?: { message: string } };
    if (!response.ok || !data.match || !data.events) { setError(data.error?.message ?? '試合を読み込めません。'); return; }
    const maxLoadedSeq = Math.max(0, ...data.events.map((event) => event.seq));
    setMatch(data.match); setEvents(data.events); setCursor((value) => value === Number.MAX_SAFE_INTEGER ? maxLoadedSeq : value);
    const alreadyInitialized = presentationInitialized.current;
    presentationInitialized.current = true;
    setPresentedSeq((current) => presentationCursorAfterLoad(current, maxLoadedSeq, alreadyInitialized));
  }, [matchId, view]);

  useEffect(() => {
    if (mode !== 'live') return;
    const limit = presentationLimit(events, presentedSeq, voiceEnabled && voiceAvailable !== false, voiceBusy);
    if (limit !== presentedSeq) setPresentedSeq(limit);
  }, [events, mode, presentedSeq, voiceAvailable, voiceBusy, voiceEnabled]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (mode !== 'live' || terminal) return;
    sourceRef.current?.close();
    const source = new EventSource(`/api/match/${matchId}/stream?view=${view}&fromSeq=0`);
    source.addEventListener('match', (message) => {
      const event = JSON.parse((message as MessageEvent).data) as UiEvent;
      setEvents((current) => current.some((item) => item.seq === event.seq) ? current : [...current, event].sort((a, b) => a.seq - b.seq));
    });
    source.onerror = () => setError('ライブ接続を再接続しています…');
    source.onopen = () => setError('');
    sourceRef.current = source;
    const poll = setInterval(() => void load(), 2000);
    return () => { source.close(); clearInterval(poll); };
  }, [matchId, mode, view, load, terminal]);

  useEffect(() => {
    if (mode !== 'replay' || !playing) return;
    const ordered = events.map((event) => event.seq);
    const timer = setInterval(() => setCursor((current) => {
      const next = ordered.find((seq) => seq > current);
      if (next === undefined) { setPlaying(false); return current; }
      return next;
    }), 700);
    return () => clearInterval(timer);
  }, [events, mode, playing]);

  const control = useCallback(async (action: 'pause' | 'resume' | 'abort' | 'retry') => {
    await fetch(`/api/match/${matchId}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    await load();
  }, [load, matchId]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.code === 'Space' && mode === 'live' && match) { event.preventDefault(); void control(match.status === 'paused' ? 'resume' : 'pause'); }
      if (mode === 'replay' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        const ordered = events.map((item) => item.seq); const index = ordered.findIndex((seq) => seq >= cursor);
        setCursor(ordered[Math.max(0, Math.min(ordered.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))] ?? 0);
      }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [control, cursor, events, match, mode]);

  const visibleEvents = useMemo(() => events.filter((event) => mode === 'live' ? event.seq <= presentedSeq : event.seq <= cursor), [cursor, events, mode, presentedSeq]);
  const last = visibleEvents.at(-1);
  const maxSeq = Math.max(0, ...events.map((event) => event.seq));
  const phase = last?.phase ?? 'setup';
  const day = last?.day ?? 0;
  const isNight = ['night_zero', 'wolf_chat', 'night_actions', 'medium'].includes(phase);
  const executionSeats = new Set(visibleEvents.filter((event) => event.type === 'execution' && event.payload.seat).map((event) => String(event.payload.seat)));
  const victimSeats = new Set(visibleEvents.filter((event) => event.type === 'dawn' && event.payload.victim).map((event) => String(event.payload.victim)));
  const roleMap = new Map<string, string>();
  for (const event of visibleEvents) {
    const players = event.type === 'match_created' ? event.payload.players : event.type === 'match_finished' ? event.payload.roles : null;
    if (Array.isArray(players)) for (const item of players as Array<{ seat: string; role: string }>) roleMap.set(item.seat, item.role);
  }
  const latestSpeech = new Map<string, string>();
  for (const event of visibleEvents.filter((item) => item.type === 'discussion_speech')) latestSpeech.set(String(event.payload.seat), String(event.payload.speech));
  const latestVote = [...visibleEvents].reverse().find((event) => event.type === 'vote_reveal');
  const finalEvent = [...visibleEvents].reverse().find((event) => event.type === 'match_finished');

  if (!match) return <main className="viewer-loading"><span className="spinner" />{error || '試合を読み込み中…'}</main>;
  return (
    <main className={`viewer-shell ${isNight ? 'night' : 'day'}`}>
      <header className="viewer-header">
        <Link href="/" className="mini-logo"><span>AI</span>人狼</Link>
        <div className="round-status"><span>{day === 0 ? '第0夜' : `${day}日目`}</span><i /> <strong>{phaseLabel[phase] ?? phase}</strong><em className={match.status}>{match.status === 'running' ? 'LIVE' : match.status.toUpperCase()}</em></div>
        <div className="header-actions"><AudioControls compact bgmEnabled={bgmEnabled} bgmVolume={bgmVolume} voiceEnabled={voiceEnabled} voiceVolume={voiceVolume} voiceAvailable={voiceAvailable} speakingSeat={speakingSeat} onBgmChange={setBgmEnabled} onBgmVolumeChange={setBgmVolume} onVoiceChange={setVoiceEnabled} onVoiceVolumeChange={setVoiceVolume} /><div className="view-switch" aria-label="観戦視点"><button className={view === 'public' ? 'active' : ''} onClick={() => setView('public')}>公開視点</button><button className={view === 'gm' ? 'active' : ''} onClick={() => setView('gm')}>GM視点</button></div></div>
      </header>
      <div className="viewer-grid">
        <section className="board-panel">
          <div className="scene-heading"><div><span className="section-kicker">{finalEvent ? 'MATCH COMPLETE' : isNight ? 'NIGHT PHASE' : 'DAY PHASE'}</span><h1>{finalEvent ? '試合終了' : day === 0 ? '役職確認の夜' : isNight ? `${day}日目の夜` : `${day}日目の議論`}</h1></div><p>{finalEvent ? 'すべての役職と記録が公開されました' : isNight ? '秘密の行動が静かに進んでいます' : '9つの視線が、ひとつの真実を探しています'}</p></div>
          {finalEvent && <div className="winner-banner"><span>GAME SET</span><strong>{finalEvent.payload.winner === 'village' ? '村人陣営の勝利' : finalEvent.payload.winner === 'werewolf' ? '人狼陣営の勝利' : '引き分け'}</strong></div>}
          <div className="agent-board" aria-live="polite">
            {Array.from({ length: 9 }, (_, index) => {
              const number = index + 1; const seat = `seat-${number}`; const dead = executionSeats.has(seat) || victimSeats.has(seat); const role = roleMap.get(seat);
              const voice = voiceForSeat(seat as `seat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`);
              const persona = personaForSeat(seat as `seat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`);
              return <article className={`agent-card ${dead ? 'dead' : ''} ${speakingSeat === seat ? 'speaking' : ''}`} key={seat}><div className="agent-top"><AgentAvatar index={number} name={persona.name} dead={dead} /><div><span className="seat-label">SEAT {String(number).padStart(2, '0')}</span><h2>{persona.name}</h2><small className="persona-name">{persona.title}</small><small className="voice-name">VOICE: {voice?.speakerName}</small></div><span className={`life-badge ${dead ? 'dead' : ''}`}>{speakingSeat === seat ? '発声中' : dead ? '死亡' : '生存'}</span></div>{role && <div className={`role-badge ${role}`}>{roleLabel[role]}</div>}<blockquote>{latestSpeech.get(seat) ?? (dead ? '発言を終了しました' : '次の発言を待っています…')}</blockquote></article>;
            })}
          </div>
          {latestVote && <section className="vote-panel"><div><span className="section-kicker">VOTE RESULT</span><h2>{latestVote.payload.round === 2 ? '決選投票' : '投票結果'}</h2></div><div className="vote-bars">{Object.entries((latestVote.payload.tally ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([seat, count]) => <div className="vote-bar" key={seat}><span>{seatName(seat)}</span><i style={{ width: `${Math.max(12, count * 24)}%` }} /><strong>{count}</strong></div>)}</div></section>}
        </section>
        <aside className="timeline-panel"><div className="timeline-head"><div><span className="section-kicker">EVENT LOG</span><h2>時系列ログ</h2></div><span>{visibleEvents.length} events</span></div><div className="timeline" aria-live="polite">{[...visibleEvents].reverse().map((event) => <article className={`timeline-event ${event.type}`} key={event.seq}><span className="seq">#{String(event.seq).padStart(3, '0')}</span><div><small>{event.day === 0 ? '第0夜' : `${event.day}日目`} · {eventLabel[event.type] ?? phaseLabel[event.phase] ?? event.type}</small><p>{eventText(event)}</p>{view === 'gm' && event.visibility === 'private' && <em>GM SECRET</em>}</div></article>)}</div></aside>
      </div>
      <footer className="control-dock">
        <div className="seed-display"><span>SEED</span><strong>{match.seed}</strong></div>
        {mode === 'live' ? <div className="live-controls">{terminal ? <Link className="dock-link" href={`/replay/${matchId}`}>リプレイを見る →</Link> : match.status === 'paused_error' ? <><div className="error-strip"><strong>{match.error?.model}</strong><span>{match.error?.message}</span></div><button onClick={() => void control('retry')}>再試行</button></> : <><button onClick={() => void control(match.status === 'paused' ? 'resume' : 'pause')}>{match.status === 'paused' ? '▶ 再開' : 'Ⅱ 一時停止'}</button><button className="danger" onClick={() => void control('abort')}>中断</button></>}</div> : <div className="replay-controls"><button onClick={() => setCursor(Math.max(0, events.filter((event) => event.seq < cursor).at(-1)?.seq ?? 0))}>‹</button><button className="play" onClick={() => setPlaying((value) => !value)}>{playing ? 'Ⅱ' : '▶'}</button><input aria-label="リプレイ位置" type="range" min="0" max={maxSeq} value={Math.min(cursor, maxSeq)} onChange={(event) => setCursor(Number(event.target.value))} /><span>{Math.min(cursor, maxSeq)} / {maxSeq}</span><button onClick={() => setCursor(events.find((event) => event.seq > cursor)?.seq ?? maxSeq)}>›</button></div>}
        <div className="api-count">API CALLS <strong>{match.apiCalls}</strong> / 240</div>
      </footer>
      {error && <div className="connection-toast">{error}</div>}
    </main>
  );
}
