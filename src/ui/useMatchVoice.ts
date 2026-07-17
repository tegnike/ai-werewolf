'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UiEvent } from './types';

interface SpeechItem { seq: number; seat: string; speech: string }

export function useMatchVoice(events: UiEvent[], onSpeechStart: (seq: number) => void, paused = false) {
  const [enabled, setEnabledState] = useState(true);
  const enabledRef = useRef(true);
  const [speakingSeat, setSpeakingSeat] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [volume, setVolumeState] = useState(0.9);
  const volumeRef = useRef(0.9);
  const [busy, setBusy] = useState(false);
  const [speakingSeq, setSpeakingSeq] = useState<number | null>(null);
  const lastObservedSeq = useRef<number | null>(null);
  const queue = useRef<SpeechItem[]>([]);
  const pumping = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const currentItem = useRef<SpeechItem | null>(null);
  const finishCurrentAudio = useRef<(() => void) | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    const stored = window.localStorage.getItem('werewolf-voice');
    const initialEnabled = stored === null ? true : stored === '1';
    enabledRef.current = initialEnabled;
    setEnabledState(initialEnabled);
    const storedVoiceVolume = window.localStorage.getItem('werewolf-voice-volume');
    const storedVolume = storedVoiceVolume === null ? Number.NaN : Number(storedVoiceVolume);
    const initialVolume = Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1 ? storedVolume : 0.9;
    volumeRef.current = initialVolume;
    setVolumeState(initialVolume);
    void fetch('/api/voicevox', { cache: 'no-store' }).then((response) => response.json()).then((data: { available: boolean }) => setAvailable(data.available)).catch(() => setAvailable(false));
  }, []);

  const stopVoice = useCallback(() => {
    queue.current = [];
    currentAudio.current?.pause();
    finishCurrentAudio.current?.();
    setBusy(false);
    setSpeakingSeat(null);
    setSpeakingSeq(null);
  }, []);

  const markSpeechStarted = useCallback((item: SpeechItem) => {
    setSpeakingSeat(item.seat);
    setSpeakingSeq(item.seq);
    onSpeechStart(item.seq);
  }, [onSpeechStart]);

  const pump = useCallback(async () => {
    if (pumping.current || pausedRef.current || !enabledRef.current || available === false) return;
    pumping.current = true;
    setBusy(true);
    while (queue.current.length > 0 && enabledRef.current && !pausedRef.current) {
      const item = queue.current.shift();
      if (!item) break;
      try {
        const response = await fetch('/api/voicevox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: item.seat, text: item.speech }) });
        if (!response.ok) { setAvailable(false); break; }
        if (!enabledRef.current) break;
        const url = URL.createObjectURL(await response.blob());
        const audio = new Audio(url);
        audio.volume = volumeRef.current;
        currentAudio.current = audio;
        currentItem.current = item;
        await new Promise<void>((resolve) => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            resolve();
          };
          finishCurrentAudio.current = finish;
          audio.onended = finish;
          audio.onerror = finish;
          if (!pausedRef.current) {
            void audio.play().then(() => markSpeechStarted(item)).catch(() => {
              markSpeechStarted(item);
              finish();
            });
          }
        });
        setSpeakingSeat(null);
        setSpeakingSeq(null);
        URL.revokeObjectURL(url);
        currentAudio.current = null;
        currentItem.current = null;
        finishCurrentAudio.current = null;
      } catch { setAvailable(false); break; }
    }
    pumping.current = false;
    setBusy(false);
    setSpeakingSeat(null);
    setSpeakingSeq(null);
    if (queue.current.length > 0 && enabledRef.current && !pausedRef.current) void pump();
  }, [available, markSpeechStarted]);

  useEffect(() => {
    pausedRef.current = paused;
    const audio = currentAudio.current;
    const item = currentItem.current;
    if (paused) {
      audio?.pause();
      return;
    }
    if (audio && item) {
      void audio.play().then(() => markSpeechStarted(item)).catch(() => finishCurrentAudio.current?.());
      return;
    }
    void pump();
  }, [markSpeechStarted, paused, pump]);

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
    enabledRef.current = value;
    setEnabledState(value);
  }, []);
  const setVolume = useCallback((value: number) => {
    window.localStorage.setItem('werewolf-voice-volume', String(value));
    volumeRef.current = value;
    setVolumeState(value);
    if (currentAudio.current) currentAudio.current.volume = value;
  }, []);
  return { voiceEnabled: enabled, setVoiceEnabled: setEnabled, voiceAvailable: available, speakingSeat, speakingSeq, voiceVolume: volume, setVoiceVolume: setVolume, voiceBusy: busy };
}
