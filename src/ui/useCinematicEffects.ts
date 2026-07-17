'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CINEMATIC_INTER_CUE_GAP_MS, cinematicCuesBetween, type CinematicCue, type CinematicSound } from './cinematic';
import type { UiEvent } from './types';

const SOUND_SOURCE: Record<CinematicSound, string> = {
  scene: '/assets/sfx_scene_change.ogg',
  vote: '/assets/sfx_vote.ogg',
  attack: '/assets/sfx_attack.ogg',
  execution: '/assets/sfx_execution.ogg',
};

function storedSfxEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem('werewolf-sfx') !== '0';
}

export function useCinematicEffects(events: UiEvent[], resetKey: string, announceInitial = false) {
  const [cue, setCue] = useState<CinematicCue | null>(null);
  const [cinematicBusy, setCinematicBusy] = useState(false);
  const [sfxEnabled, setSfxEnabledState] = useState(true);
  const sfxEnabledRef = useRef(true);
  const seenSeq = useRef<number | null>(announceInitial ? 0 : null);
  const observedResetKey = useRef(resetKey);
  const activeCue = useRef<CinematicCue | null>(null);
  const betweenCues = useRef(false);
  const nextCueTimer = useRef<number | null>(null);
  const queue = useRef<CinematicCue[]>([]);
  const audio = useRef<Partial<Record<CinematicSound, HTMLAudioElement>>>({});

  useEffect(() => {
    const enabled = storedSfxEnabled();
    sfxEnabledRef.current = enabled;
    setSfxEnabledState(enabled);
    for (const [kind, source] of Object.entries(SOUND_SOURCE) as Array<[CinematicSound, string]>) {
      const element = new Audio(source);
      element.preload = 'auto';
      element.volume = 0.8;
      element.dataset.sfxPlayer = kind;
      audio.current[kind] = element;
    }
    return () => {
      for (const element of Object.values(audio.current)) element?.pause();
      audio.current = {};
    };
  }, []);

  const playSound = useCallback((sound: CinematicSound) => {
    if (!sfxEnabledRef.current) return;
    const element = audio.current[sound];
    if (!element) return;
    element.currentTime = 0;
    void element.play().catch(() => {
      // Browsers may block audio until the page has received a user gesture.
    });
  }, []);

  const startNext = useCallback(() => {
    if (activeCue.current || betweenCues.current) return;
    const next = queue.current.shift();
    if (!next) {
      setCinematicBusy(false);
      return;
    }
    activeCue.current = next;
    setCinematicBusy(true);
    setCue(next);
    playSound(next.sound);
  }, [playSound]);

  useLayoutEffect(() => {
    if (observedResetKey.current === resetKey) return;
    observedResetKey.current = resetKey;
    seenSeq.current = null;
    activeCue.current = null;
    betweenCues.current = false;
    if (nextCueTimer.current !== null) window.clearTimeout(nextCueTimer.current);
    nextCueTimer.current = null;
    queue.current = [];
    setCinematicBusy(false);
    setCue(null);
  }, [resetKey]);

  useLayoutEffect(() => {
    const maxSeq = Math.max(0, ...events.map((event) => event.seq));
    if (seenSeq.current === null) {
      if (events.length === 0) return;
      seenSeq.current = maxSeq;
      return;
    }
    if (maxSeq < seenSeq.current) {
      seenSeq.current = maxSeq;
      activeCue.current = null;
      betweenCues.current = false;
      if (nextCueTimer.current !== null) window.clearTimeout(nextCueTimer.current);
      nextCueTimer.current = null;
      queue.current = [];
      setCinematicBusy(false);
      setCue(null);
      return;
    }
    const freshCues = cinematicCuesBetween(events, seenSeq.current, maxSeq);
    seenSeq.current = maxSeq;
    if (freshCues.length === 0) return;
    queue.current.push(...freshCues);
    setCinematicBusy(true);
    startNext();
  }, [events, startNext]);

  useEffect(() => {
    if (!cue) return;
    const timer = window.setTimeout(() => {
      activeCue.current = null;
      setCue(null);
      betweenCues.current = true;
      nextCueTimer.current = window.setTimeout(() => {
        nextCueTimer.current = null;
        betweenCues.current = false;
        startNext();
      }, CINEMATIC_INTER_CUE_GAP_MS);
    }, cue.durationMs);
    return () => window.clearTimeout(timer);
  }, [cue, startNext]);

  useEffect(() => () => {
    if (nextCueTimer.current !== null) window.clearTimeout(nextCueTimer.current);
  }, []);

  const setSfxEnabled = useCallback((value: boolean) => {
    window.localStorage.setItem('werewolf-sfx', value ? '1' : '0');
    sfxEnabledRef.current = value;
    setSfxEnabledState(value);
    if (!value) for (const element of Object.values(audio.current)) element?.pause();
  }, []);

  return { cinematicCue: cue, cinematicBusy, sfxEnabled, setSfxEnabled };
}
