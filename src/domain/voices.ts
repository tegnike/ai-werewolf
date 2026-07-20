import type { SeatId } from './types';

export interface AgentVoice {
  seat: SeatId;
  speakerId: number;
  speakerName: string;
  styleName: string;
  presentation: 'female' | 'male' | 'androgynous';
}

export const AGENT_VOICES: AgentVoice[] = [
  { seat: 'seat-1', speakerId: 2, speakerName: '四国めたん', styleName: 'ノーマル', presentation: 'female' },
  { seat: 'seat-2', speakerId: 70, speakerName: '満別花丸', styleName: '元気', presentation: 'female' },
  { seat: 'seat-3', speakerId: 8, speakerName: '春日部つむぎ', styleName: 'ノーマル', presentation: 'female' },
  { seat: 'seat-4', speakerId: 10, speakerName: '雨晴はう', styleName: 'ノーマル', presentation: 'female' },
  { seat: 'seat-5', speakerId: 9, speakerName: '波音リツ', styleName: 'ノーマル', presentation: 'female' },
  { seat: 'seat-6', speakerId: 11, speakerName: '玄野武宏', styleName: 'ノーマル', presentation: 'male' },
  { seat: 'seat-7', speakerId: 12, speakerName: '白上虎太郎', styleName: 'ふつう', presentation: 'male' },
  { seat: 'seat-8', speakerId: 42, speakerName: 'ちび式じい', styleName: 'ノーマル', presentation: 'male' },
  { seat: 'seat-9', speakerId: 14, speakerName: '冥鳴ひまり', styleName: 'ノーマル', presentation: 'female' },
];

export const voiceForSeat = (seat: SeatId): AgentVoice | undefined => AGENT_VOICES.find((voice) => voice.seat === seat);
