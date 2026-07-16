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
import { derivePresentedState, presentationCursorAfterLoad, presentationLimit } from './presentation';
import { buildEpilogue, epilogueRoleLabel, fateLabel, type SpectatorDeathRecord } from './epilogue';
import { SpectatorGuide } from './SpectatorGuide';

const roleLabel: Record<string, string> = { villager: '村人', werewolf: '人狼', seer: '占い師', medium: '霊媒師', bodyguard: '狩人', madman: '狂人' };
const phaseLabel: Record<string, string> = { setup: '準備', night_zero: '第0夜', dawn: '夜明け', discussion: '議論', vote: '投票', runoff: '決選投票', execution: '処刑', medium: '霊媒', wolf_chat: '人狼会話', night_actions: '夜の行動', finished: '終了' };
const eventLabel: Record<string, string> = { match_created: '配役決定', dawn: '夜明け', discussion_speech: '発言', vote_cast: '投票', vote_reveal: '開票', execution: '処刑', match_finished: '決着', anomaly_flag: '異常終了', werewolf_chat: '人狼会話', seer_result: '占い', medium_result: '霊媒', guard_choice: '護衛', attack_choice: '襲撃選択', night_resolved: '夜の解決', werewolf_reveal: '人狼確認', decision_note: '最終決定' };

interface VoteEntry { voter: string; target: string; statedReason?: string }

function seatNumber(seat: unknown): number { return Number(String(seat ?? '').split('-')[1]) || 0; }
function seatName(seat: unknown): string {
  const value = seatNumber(seat);
  return value ? agentNameForSeat(`seat-${value}` as `seat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`) : 'なし';
}
function voteEntries(event?: UiEvent): VoteEntry[] {
  if (!event || !Array.isArray(event.payload.votes)) return [];
  return event.payload.votes.flatMap((vote) => {
    if (!vote || typeof vote !== 'object') return [];
    const item = vote as Record<string, unknown>;
    if (typeof item.voter !== 'string' || typeof item.target !== 'string') return [];
    return [{ voter: item.voter, target: item.target, ...(typeof item.statedReason === 'string' ? { statedReason: item.statedReason } : {}) }];
  });
}
function voteResultText(event: UiEvent): string {
  const votes = voteEntries(event);
  const tally = (event.payload.tally ?? {}) as Record<string, number>;
  return Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([target, count]) => `${seatName(target)} ← ${votes.filter((vote) => vote.target === target).map((vote) => seatName(vote.voter)).join('・') || 'なし'}（${count}票）`)
    .join(' / ');
}
function eventText(event: UiEvent): string {
  const p = event.payload;
  if (event.type === 'discussion_speech') return `${seatName(p.seat)}「${String(p.speech)}」`;
  if (event.type === 'dawn') return p.victim ? `${seatName(p.victim)}が犠牲になりました。` : '犠牲者はいません。';
  if (event.type === 'execution') return p.seat ? `${seatName(p.seat)}が処刑されました。` : '同数のため処刑はありません。';
  if (event.type === 'vote_reveal') return `${p.round === 2 ? '決選投票: ' : ''}${voteResultText(event)}`;
  if (event.type === 'vote_cast') return `${seatName(p.voter)} → ${seatName(p.target)}${p.statedReason ? `「${String(p.statedReason)}」` : ''}`;
  if (event.type === 'match_finished') return `${p.winner === 'village' ? '村人陣営' : p.winner === 'werewolf' ? '人狼陣営' : '引き分け'}で決着`;
  if (event.type === 'werewolf_chat') return `${seatName(p.seat)}「${String(p.speech)}」`;
  if (event.type === 'werewolf_reveal') return `人狼は${Array.isArray(p.wolves) ? p.wolves.map((wolf) => seatName((wolf as Record<string, unknown>).seat)).join('・') : '未確認'}`;
  if (event.type === 'seer_result') return `${seatName(p.seat)}が${seatName(p.targetSeat)}を占い「${String(p.result)}」`;
  if (event.type === 'medium_result') return `${seatName(p.seat)}が${seatName(p.targetSeat)}を霊媒し「${String(p.result)}」`;
  if (event.type === 'guard_choice') return `${seatName(p.seat)}が${seatName(p.targetSeat)}を護衛${p.statedReason ? `「${String(p.statedReason)}」` : ''}`;
  if (event.type === 'attack_choice') return `${seatName(p.seat)}が${seatName(p.targetSeat)}を襲撃候補に選択${p.statedReason ? `「${String(p.statedReason)}」` : ''}`;
  if (event.type === 'decision_note') return `襲撃の最終決定: ${seatName(p.seat)} → ${seatName(p.targetSeat)}${p.statedReason ? `「${String(p.statedReason)}」` : ''}`;
  if (event.type === 'night_resolved') return p.guarded ? `護衛成功。${seatName(p.guardTarget)}への襲撃を防ぎました。` : `襲撃 ${seatName(p.attackTarget)} / 護衛 ${seatName(p.guardTarget)}`;
  if (event.type === 'match_created') return '9人の配役と座席が決まりました。';
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
  const voiceEvents = useMemo(() => view === 'gm' ? events : events.filter((event) => event.visibility !== 'private'), [events, view]);
  const visibleEvents = useMemo(() => events.filter((event) => mode === 'live' ? event.seq <= presentedSeq : event.seq <= cursor), [cursor, events, mode, presentedSeq]);
  const presentedStatus = mode === 'replay' && match?.status === 'finished' && !visibleEvents.some((event) => event.type === 'match_finished') ? 'running' : match?.status;
  const presentedState = useMemo(() => derivePresentedState(visibleEvents, presentedStatus), [presentedStatus, visibleEvents]);
  const audioMood = ['night_zero', 'wolf_chat', 'night_actions', 'medium'].includes(presentedState.phase) ? 'night' : 'day';
  const { bgmEnabled, setBgmEnabled, bgmVolume, setBgmVolume, duckBgm } = useAmbientBgm(audioMood);
  const revealSpeech = useCallback((seq: number) => setPresentedSeq((current) => Math.max(current, seq)), []);
  const { voiceEnabled, setVoiceEnabled, voiceAvailable, speakingSeat, voiceVolume, setVoiceVolume, voiceBusy } = useMatchVoice(voiceEvents, duckBgm, revealSpeech);

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
    const limit = presentationLimit(voiceEvents, presentedSeq, voiceEnabled && voiceAvailable !== false, voiceBusy);
    if (limit !== presentedSeq) setPresentedSeq(limit);
  }, [mode, presentedSeq, voiceAvailable, voiceBusy, voiceEnabled, voiceEvents]);

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

  const maxSeq = Math.max(0, ...events.map((event) => event.seq));
  const { phase, day } = presentedState;
  const isNight = ['night_zero', 'wolf_chat', 'night_actions', 'medium'].includes(phase);
  const deathRecords = new Map<string, SpectatorDeathRecord>();
  for (const event of visibleEvents) {
    if (event.type === 'execution' && event.payload.seat) deathRecords.set(String(event.payload.seat), { cause: 'execution', day: event.day });
    if (event.type === 'dawn' && event.payload.victim) deathRecords.set(String(event.payload.victim), { cause: 'attack', day: event.day });
  }
  const roleMap = new Map<string, string>();
  for (const event of visibleEvents) {
    const players = event.type === 'match_created' ? event.payload.players : event.type === 'match_finished' ? event.payload.roles : null;
    if (Array.isArray(players)) for (const item of players as Array<{ seat: string; role: string }>) roleMap.set(item.seat, item.role);
  }
  const latestSpeech = new Map<string, string>();
  for (const event of visibleEvents.filter((item) => item.type === 'discussion_speech')) latestSpeech.set(String(event.payload.seat), String(event.payload.speech));
  const latestVote = [...visibleEvents].reverse().find((event) => event.type === 'vote_reveal');
  const latestVotes = voteEntries(latestVote);
  const latestVoteByVoter = new Map(latestVotes.map((vote) => [vote.voter, vote.target]));
  const latestTally = (latestVote?.payload.tally ?? {}) as Record<string, number>;
  const maxVoteCount = Math.max(1, ...Object.values(latestTally));
  const finalEvent = [...visibleEvents].reverse().find((event) => event.type === 'match_finished');
  const epilogue = finalEvent ? buildEpilogue(finalEvent.payload.roles, finalEvent.payload.winner, deathRecords) : [];
  const canSeeSecrets = view === 'gm' || terminal;
  const survivorCount = 9 - deathRecords.size;
  const livingWerewolves = [...roleMap.entries()].filter(([seat, role]) => role === 'werewolf' && !deathRecords.has(seat)).length;
  const timelineEvents = [...visibleEvents].reverse();
  const sceneTitle = finalEvent ? '試合終了' : day === 0 ? '役職確認の夜' : isNight ? `${day}日目の夜` : phase === 'vote' ? `${day}日目の投票` : phase === 'runoff' ? `${day}日目の決選投票` : phase === 'execution' ? `${day}日目の処刑` : `${day}日目の議論`;
  const sceneDescription = finalEvent ? '全配役と夜の記録を公開。試合の真相を答え合わせできます' : isNight ? '夜の処理中です。次の夜明けをお待ちください' : phase === 'vote' || phase === 'runoff' ? '全員の票が揃うまで、投票先は公開されません' : phase === 'execution' ? '開票結果により処刑者が決まります' : '発言と投票履歴から、人狼を推理してください';

  if (!match) return <main className="viewer-loading"><span className="spinner" />{error || '試合を読み込み中…'}</main>;
  return (
    <main className={`viewer-shell ${isNight ? 'night' : 'day'}`}>
      <header className="viewer-header">
        <Link href="/" className="mini-logo"><span>AI</span>人狼</Link>
        <div className="round-status">
          <span>{day === 0 ? '第0夜' : `${day}日目`}</span><i />
          <strong>{phaseLabel[phase] ?? phase}</strong>
          <span className="survivor-count">生存 {survivorCount}/9</span>
          {canSeeSecrets && roleMap.size > 0 && <span className="wolf-count">人狼残り {livingWerewolves}</span>}
          <em className={match.status}>{match.status === 'running' ? 'LIVE' : match.status.toUpperCase()}</em>
        </div>
        <div className="header-actions"><AudioControls compact bgmEnabled={bgmEnabled} bgmVolume={bgmVolume} voiceEnabled={voiceEnabled} voiceVolume={voiceVolume} voiceAvailable={voiceAvailable} speakingSeat={speakingSeat} onBgmChange={setBgmEnabled} onBgmVolumeChange={setBgmVolume} onVoiceChange={setVoiceEnabled} onVoiceVolumeChange={setVoiceVolume} /><div className="view-switch" aria-label="観戦視点"><button className={view === 'public' ? 'active' : ''} onClick={() => setView('public')}>公開視点</button><button className={view === 'gm' ? 'active' : ''} onClick={() => setView('gm')}>GM視点</button></div></div>
      </header>
      <div className="viewer-grid">
        <section className="board-panel">
          <div className="scene-heading"><div><span className="section-kicker">{finalEvent ? 'MATCH COMPLETE' : isNight ? 'NIGHT PHASE' : phase === 'vote' || phase === 'runoff' ? 'VOTING PHASE' : 'DAY PHASE'}</span><h1>{sceneTitle}</h1></div><div className="scene-actions"><p>{sceneDescription}</p><SpectatorGuide /></div></div>
          {finalEvent && <div className="winner-banner"><span>GAME SET</span><strong>{finalEvent.payload.winner === 'village' ? '村人陣営の勝利' : finalEvent.payload.winner === 'werewolf' ? '人狼陣営の勝利' : '引き分け'}</strong></div>}
          {finalEvent && epilogue.length > 0 && <section className="epilogue" aria-labelledby="epilogue-title">
            <div className="epilogue-head"><div><span className="section-kicker">MINI EPILOGUE</span><h2 id="epilogue-title">全員の正体と結末</h2></div><p>狂人は判定上は人間ですが、<strong>人狼陣営</strong>の一員です。</p></div>
            <div className="epilogue-teams">
              {(['village', 'werewolf'] as const).map((team) => <section className={`epilogue-team ${team}`} aria-label={team === 'village' ? '村人陣営の配役' : '人狼陣営の配役'} key={team}>
                <h3>{team === 'village' ? '村人陣営' : '人狼陣営'} <small>{epilogue.filter((player) => player.team === team && player.result === '勝利').length > 0 ? 'WIN' : finalEvent.payload.winner === 'draw' ? 'DRAW' : 'LOSE'}</small></h3>
                <ul>{epilogue.filter((player) => player.team === team).map((player) => <li key={player.seat}><span><strong>{player.name}</strong><small>{epilogueRoleLabel(player.role)}{player.role === 'madman' ? '（判定は人間）' : ''}</small></span><span className="epilogue-fate">{player.fate}</span><em className={player.result === '勝利' ? 'win' : player.result === '敗北' ? 'lose' : 'draw'}>{player.result}</em></li>)}</ul>
              </section>)}
            </div>
          </section>}
          <div className="agent-board" aria-live="polite">
            {Array.from({ length: 9 }, (_, index) => {
              const number = index + 1; const seat = `seat-${number}`; const deathRecord = deathRecords.get(seat); const dead = Boolean(deathRecord); const role = roleMap.get(seat);
              const voice = voiceForSeat(seat as `seat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`);
              const persona = personaForSeat(seat as `seat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`);
              const votedFor = latestVoteByVoter.get(seat);
              return <article className={`agent-card ${dead ? 'dead' : ''} ${speakingSeat === seat ? 'speaking' : ''}`} key={seat}>
                <div className="agent-top"><AgentAvatar index={number} name={persona.name} dead={dead} /><div><span className="seat-label">SEAT {String(number).padStart(2, '0')}</span><h2>{persona.name}</h2><small className="persona-name">{persona.title}</small><small className="voice-name">VOICE: {voice?.speakerName}</small>{deathRecord && <small className="death-record">{fateLabel(deathRecord)}</small>}</div><span className={`life-badge ${dead ? 'dead' : ''}`}>{speakingSeat === seat ? '発声中' : dead ? '死亡' : '生存'}</span></div>
                {role && <div className={`role-badge ${role}`}>{roleLabel[role]}</div>}
                <blockquote>{latestSpeech.get(seat) ?? (dead ? '発言を終了しました' : '次の発言を待っています…')}</blockquote>
                {votedFor && <div className="card-vote"><span>{latestVote?.day}日目{latestVote?.payload.round === 2 ? '決選' : ''}投票</span><strong>→ {seatName(votedFor)}</strong></div>}
              </article>;
            })}
          </div>
          {latestVote && <section className={`vote-panel ${latestVote.day < day ? 'stale' : ''}`}>
            <div><span className="section-kicker">VOTE RESULT</span><h2>{latestVote.day}日目の{latestVote.payload.round === 2 ? '決選投票' : '投票結果'}</h2>{latestVote.day < day && <small>前日の結果</small>}</div>
            <div className="vote-bars">{Object.entries(latestTally).sort((a, b) => b[1] - a[1]).map(([seat, count]) => {
              const voters = latestVotes.filter((vote) => vote.target === seat);
              return <div className="vote-bar" key={seat}>
                <div className="vote-bar-head"><span>{seatName(seat)}</span><strong>{count}票</strong></div>
                <i><b style={{ width: `${Math.max(8, (count / maxVoteCount) * 100)}%` }} /></i>
                <div className="voter-chips">{voters.map((vote) => <span key={vote.voter}>{seatName(vote.voter)}</span>)}</div>
                {canSeeSecrets && voters.some((vote) => vote.statedReason) && <details className="vote-reasons"><summary>投票理由 {voters.filter((vote) => vote.statedReason).length}件</summary>{voters.filter((vote) => vote.statedReason).map((vote) => <small key={vote.voter}>{seatName(vote.voter)}「{vote.statedReason}」</small>)}</details>}
              </div>;
            })}</div>
          </section>}
        </section>
        <aside className="timeline-panel"><div className="timeline-head"><div><span className="section-kicker">EVENT LOG</span><h2>時系列ログ</h2></div><span>{visibleEvents.length} events</span></div><div className="timeline" aria-live="polite">{timelineEvents.map((event, index) => <div className="timeline-entry" key={event.seq}>{(index === 0 || timelineEvents[index - 1]?.day !== event.day) && <div className="timeline-day"><span>{event.day === 0 ? '第0夜' : `${event.day}日目`}</span></div>}<article className={`timeline-event ${event.type}`}><span className="seq">#{String(event.seq).padStart(3, '0')}</span><div><small>{eventLabel[event.type] ?? phaseLabel[event.phase] ?? event.type}</small><p>{eventText(event)}</p>{event.visibility === 'private' && <em>{view === 'gm' ? 'GM SECRET' : 'REVEALED SECRET'}</em>}</div></article></div>)}</div></aside>
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
