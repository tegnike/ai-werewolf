'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UiEvent } from './types';
import { fillSpeechPrefetch, POST_SPEECH_GAP_MS, type SpeechItem } from './voice-prefetch';

export function useMatchVoice(matchId: string, events: UiEvent[], onSpeechStart: (seq: number) => void, paused = false) {
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
  const preparedAudio = useRef<Map<number, Promise<Blob | null>>>(new Map());
  const synthesisControllers = useRef<Map<number, AbortController>>(new Map());
  const pumping = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const currentItem = useRef<SpeechItem | null>(null);
  const finishCurrentAudio = useRef<(() => void) | null>(null);
  const finishPostSpeechGap = useRef<(() => void) | null>(null);
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
    void fetch(`/api/tts?matchId=${encodeURIComponent(matchId)}`, { cache: 'no-store' }).then((response) => response.json()).then((data: { available: boolean }) => setAvailable(data.available)).catch(() => setAvailable(false));
  }, [matchId]);

  const stopVoice = useCallback(() => {
    queue.current = [];
    for (const controller of synthesisControllers.current.values()) controller.abort();
    synthesisControllers.current.clear();
    preparedAudio.current.clear();
    currentAudio.current?.pause();
    finishCurrentAudio.current?.();
    finishPostSpeechGap.current?.();
    setBusy(false);
    setSpeakingSeat(null);
    setSpeakingSeq(null);
  }, []);

  const markSpeechStarted = useCallback((item: SpeechItem) => {
    setSpeakingSeat(item.seat);
    setSpeakingSeq(item.seq);
    onSpeechStart(item.seq);
  }, [onSpeechStart]);

  const prepareSpeech = useCallback((item: SpeechItem): Promise<Blob | null> => {
    const existing = preparedAudio.current.get(item.seq);
    if (existing) return existing;
    const controller = new AbortController();
    synthesisControllers.current.set(item.seq, controller);
    const prepared = fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId, seat: item.seat, text: item.speech }),
      signal: controller.signal,
    }).then(async (response) => response.ok ? response.blob() : null)
      .catch(() => null)
      .finally(() => synthesisControllers.current.delete(item.seq));
    preparedAudio.current.set(item.seq, prepared);
    return prepared;
  }, [matchId]);

  const prefetchQueuedSpeech = useCallback(() => {
    fillSpeechPrefetch(queue.current, preparedAudio.current, prepareSpeech);
  }, [prepareSpeech]);

  const pump = useCallback(async () => {
    if (pumping.current || pausedRef.current || !enabledRef.current || available === false) return;
    pumping.current = true;
    setBusy(true);
    while (queue.current.length > 0 && enabledRef.current && !pausedRef.current) {
      prefetchQueuedSpeech();
      const item = queue.current.shift();
      if (!item) break;
      try {
        const blob = await prepareSpeech(item);
        preparedAudio.current.delete(item.seq);
        prefetchQueuedSpeech();
        // キャラクターごとにTTSが異なるため、1話者のEngine失敗で他の話者まで無効化しない。
        if (!blob) continue;
        if (!enabledRef.current) break;
        const url = URL.createObjectURL(blob);
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
        URL.revokeObjectURL(url);
        currentAudio.current = null;
        currentItem.current = null;
        finishCurrentAudio.current = null;
        await new Promise<void>((resolve) => {
          let timer: ReturnType<typeof setTimeout> | null = null;
          const finish = () => {
            if (timer !== null) clearTimeout(timer);
            if (finishPostSpeechGap.current === finish) finishPostSpeechGap.current = null;
            resolve();
          };
          finishPostSpeechGap.current = finish;
          timer = setTimeout(finish, POST_SPEECH_GAP_MS);
        });
        setSpeakingSeat(null);
        setSpeakingSeq(null);
      } catch { continue; }
    }
    pumping.current = false;
    setBusy(false);
    setSpeakingSeat(null);
    setSpeakingSeq(null);
    if (queue.current.length > 0 && enabledRef.current && !pausedRef.current) void pump();
  }, [available, markSpeechStarted, prefetchQueuedSpeech, prepareSpeech]);

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
    prefetchQueuedSpeech();
    void pump();
  }, [enabled, events, prefetchQueuedSpeech, pump]);

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
