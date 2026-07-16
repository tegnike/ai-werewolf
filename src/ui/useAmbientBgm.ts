'use client';

import { useCallback, useEffect, useState } from 'react';

const BGM_SOURCE = '/assets/bgm_village.ogg';

class AmbientBgm {
  private audio: HTMLAudioElement | null = null;
  private volume = 0.7;
  private ducked = false;

  private targetVolume(): number {
    return this.volume * (this.ducked ? 0.28 : 1);
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = document.createElement('audio');
    audio.src = BGM_SOURCE;
    audio.loop = true;
    audio.preload = 'auto';
    audio.hidden = true;
    audio.dataset.bgmPlayer = 'true';
    audio.dataset.state = 'ready';
    audio.volume = this.targetVolume();
    audio.addEventListener('playing', () => { audio.dataset.state = 'playing'; });
    audio.addEventListener('pause', () => { audio.dataset.state = 'paused'; });
    audio.addEventListener('error', () => { audio.dataset.state = 'error'; });
    document.body.append(audio);
    this.audio = audio;
    return audio;
  }

  async start(mood: 'day' | 'night'): Promise<void> {
    const audio = this.ensureAudio();
    audio.dataset.mood = mood;
    audio.volume = this.targetVolume();
    if (!audio.paused) return;
    audio.dataset.state = 'starting';
    try {
      await audio.play();
    } catch {
      // Autoplay may be blocked until the next pointer or keyboard gesture.
      audio.dataset.state = 'awaiting-gesture';
    }
  }

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  duck(active: boolean): void {
    this.ducked = active;
    if (this.audio) this.audio.volume = this.targetVolume();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.audio) this.audio.volume = this.targetVolume();
  }
}

// Client-side navigation across the home and match screens keeps one unlocked
// media element alive, so the BGM does not restart or lose user activation.
const sharedBgm = new AmbientBgm();

function storedBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === '1';
}

function storedVolume(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

export function useAmbientBgm(mood: 'day' | 'night') {
  const [enabled, setEnabledState] = useState(true);
  const [volume, setVolumeState] = useState(0.7);

  useEffect(() => {
    setEnabledState(storedBoolean('werewolf-bgm', true));
    setVolumeState(storedVolume('werewolf-bgm-volume', 0.7));
  }, []);

  useEffect(() => {
    sharedBgm.setVolume(volume);
    if (!enabled) {
      sharedBgm.stop();
      return;
    }
    void sharedBgm.start(mood);
    const unlock = () => void sharedBgm.start(mood);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled, mood, volume]);

  const setEnabled = useCallback((value: boolean) => {
    window.localStorage.setItem('werewolf-bgm', value ? '1' : '0');
    setEnabledState(value);
    if (value) void sharedBgm.start(mood);
    else sharedBgm.stop();
  }, [mood]);
  const duck = useCallback((active: boolean) => sharedBgm.duck(active), []);
  const setVolume = useCallback((value: number) => {
    window.localStorage.setItem('werewolf-bgm-volume', String(value));
    setVolumeState(value);
    sharedBgm.setVolume(value);
  }, []);
  return { bgmEnabled: enabled, setBgmEnabled: setEnabled, bgmVolume: volume, setBgmVolume: setVolume, duckBgm: duck };
}
