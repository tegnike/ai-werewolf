'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type AudioContextConstructor = typeof AudioContext;

class AmbientBgm {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

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
    master.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 2.5);
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
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(active ? 0.012 : 0.035, this.context.currentTime + 0.25);
  }
}

function storedBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === '1';
}

export function useAmbientBgm(mood: 'day' | 'night') {
  const bgmRef = useRef<AmbientBgm | null>(null);
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => { setEnabledState(storedBoolean('werewolf-bgm', true)); }, []);
  useEffect(() => {
    bgmRef.current ??= new AmbientBgm();
    const bgm = bgmRef.current;
    if (enabled) {
      void bgm.start(mood);
      const unlock = () => void bgm.start(mood);
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    }
    bgm.stop();
  }, [enabled, mood]);
  useEffect(() => () => bgmRef.current?.stop(), []);

  const setEnabled = useCallback((value: boolean) => {
    window.localStorage.setItem('werewolf-bgm', value ? '1' : '0');
    setEnabledState(value);
  }, []);
  const duck = useCallback((active: boolean) => bgmRef.current?.duck(active), []);
  return { bgmEnabled: enabled, setBgmEnabled: setEnabled, duckBgm: duck };
}
