'use client';

import { useCallback, useEffect, useState } from 'react';

type AudioContextConstructor = typeof AudioContext;

class AmbientBgm {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private volume = 0.7;
  private ducked = false;

  private targetGain(): number {
    return 0.24 * this.volume * (this.ducked ? 0.32 : 1);
  }

  async start(mood: 'day' | 'night'): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume();
      return;
    }
    const AudioContextClass = (window.AudioContext || (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext);
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.targetGain()), context.currentTime + 1.4);
    master.connect(context.destination);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mood === 'night' ? 520 : 760;
    filter.Q.value = 0.8;
    filter.connect(master);
    const base = mood === 'night' ? 98 : 110;
    for (const [ratio, gainValue] of [[1, 0.15], [1.5, 0.08], [2, 0.045]] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = ratio === 1 ? 'sine' : 'triangle';
      oscillator.frequency.value = base * ratio;
      oscillator.detune.value = ratio * 2.5;
      gain.gain.value = gainValue;
      oscillator.connect(gain).connect(filter);
      oscillator.start();
    }
    const shimmer = () => {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = (mood === 'night' ? 392 : 440) * (now % 12 > 6 ? 1.25 : 1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.026, now + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + 4.6);
    };
    this.context = context;
    this.master = master;
    shimmer();
    this.timer = setInterval(shimmer, 7_500);
    if (context.state === 'suspended') await context.resume();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    this.context = null;
    this.master = null;
    if (context && context.state !== 'closed') void context.close();
  }

  duck(active: boolean): void {
    this.ducked = active;
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(this.targetGain(), this.context.currentTime + 0.25);
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(Math.max(0.0001, this.targetGain()), this.context.currentTime + 0.12);
  }
}

// Client-side navigation across the home and match screens must not discard the
// AudioContext unlocked by the user's first click.
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
    const bgm = sharedBgm;
    bgm.setVolume(volume);
    if (enabled) {
      void bgm.start(mood);
      const unlock = () => void bgm.start(mood);
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    }
    bgm.stop();
  }, [enabled, mood, volume]);

  const setEnabled = useCallback((value: boolean) => {
    window.localStorage.setItem('werewolf-bgm', value ? '1' : '0');
    setEnabledState(value);
  }, []);
  const duck = useCallback((active: boolean) => sharedBgm.duck(active), []);
  const setVolume = useCallback((value: number) => {
    window.localStorage.setItem('werewolf-bgm-volume', String(value));
    setVolumeState(value);
    sharedBgm.setVolume(value);
  }, []);
  return { bgmEnabled: enabled, setBgmEnabled: setEnabled, bgmVolume: volume, setBgmVolume: setVolume, duckBgm: duck };
}
