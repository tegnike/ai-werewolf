import type { SeatId } from './types';

export interface AgentVoice {
  seat: SeatId;
  speakerId: number;
  speakerName: string;
  styleName: string;
}

export const AGENT_VOICES: AgentVoice[] = [
  { seat: 'seat-1', speakerId: 2, speakerName: '四国めたん', styleName: 'ノーマル' },
  { seat: 'seat-2', speakerId: 3, speakerName: 'ずんだもん', styleName: 'ノーマル' },
  { seat: 'seat-3', speakerId: 8, speakerName: '春日部つむぎ', styleName: 'ノーマル' },
  { seat: 'seat-4', speakerId: 10, speakerName: '雨晴はう', styleName: 'ノーマル' },
  { seat: 'seat-5', speakerId: 9, speakerName: '波音リツ', styleName: 'ノーマル' },
  { seat: 'seat-6', speakerId: 11, speakerName: '玄野武宏', styleName: 'ノーマル' },
  { seat: 'seat-7', speakerId: 12, speakerName: '白上虎太郎', styleName: 'ふつう' },
  { seat: 'seat-8', speakerId: 13, speakerName: '青山龍星', styleName: 'ノーマル' },
  { seat: 'seat-9', speakerId: 14, speakerName: '冥鳴ひまり', styleName: 'ノーマル' },
];

export const voiceForSeat = (seat: SeatId): AgentVoice | undefined => AGENT_VOICES.find((voice) => voice.seat === seat);
