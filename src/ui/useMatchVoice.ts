'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UiEvent } from './types';

interface SpeechItem { seq: number; seat: string; speech: string }

export function useMatchVoice(events: UiEvent[], duckBgm: (active: boolean) => void) {
  const [enabled, setEnabledState] = useState(false);
  const [speakingSeat, setSpeakingSeat] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const lastObservedSeq = useRef<number | null>(null);
  const queue = useRef<SpeechItem[]>([]);
  const pumping = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('werewolf-voice');
    setEnabledState(stored === null ? true : stored === '1');
    void fetch('/api/voicevox', { cache: 'no-store' }).then((response) => response.json()).then((data: { available: boolean }) => setAvailable(data.available)).catch(() => setAvailable(false));
  }, []);

  const stopVoice = useCallback(() => {
    queue.current = [];
    if (currentAudio.current) { currentAudio.current.pause(); currentAudio.current = null; }
    pumping.current = false;
    setSpeakingSeat(null);
    duckBgm(false);
  }, [duckBgm]);

  const pump = useCallback(async () => {
    if (pumping.current || !enabled || available === false) return;
    pumping.current = true;
    while (queue.current.length > 0 && enabled) {
      const item = queue.current.shift();
      if (!item) break;
      try {
        setSpeakingSeat(item.seat);
        duckBgm(true);
        const response = await fetch('/api/voicevox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: item.seat, text: item.speech }) });
        if (!response.ok) { setAvailable(false); break; }
        const url = URL.createObjectURL(await response.blob());
        const audio = new Audio(url);
        currentAudio.current = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          void audio.play().catch(() => resolve());
        });
        URL.revokeObjectURL(url);
        currentAudio.current = null;
      } catch { setAvailable(false); break; }
    }
    pumping.current = false;
    setSpeakingSeat(null);
    duckBgm(false);
  }, [available, duckBgm, enabled]);

  useEffect(() => {
    const maxSeq = Math.max(0, ...events.map((event) => event.seq));
    if (lastObservedSeq.current === null) { lastObservedSeq.current = maxSeq; return; }
    const fresh = events.filter((event) => event.seq > (lastObservedSeq.current ?? 0) && ['discussion_speech', 'werewolf_chat'].includes(event.type));
    lastObservedSeq.current = Math.max(lastObservedSeq.current, maxSeq);
    if (!enabled || fresh.length === 0) return;
    queue.current.push(...fresh.map((event) => ({ seq: event.seq, seat: String(event.payload.seat), speech: String(event.payload.speech) })));
    void pump();
  }, [enabled, events, pump]);

  useEffect(() => { if (!enabled) stopVoice(); }, [enabled, stopVoice]);
  useEffect(() => stopVoice, [stopVoice]);

  const setEnabled = useCallback((value: boolean) => {
    window.localStorage.setItem('werewolf-voice', value ? '1' : '0');
    setEnabledState(value);
  }, []);
  return { voiceEnabled: enabled, setVoiceEnabled: setEnabled, voiceAvailable: available, speakingSeat };
}
