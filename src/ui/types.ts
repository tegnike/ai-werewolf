export interface UiEvent {
  matchId: string;
  seq: number;
  day: number;
  phase: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  visibility?: 'public' | 'private';
  audienceSeats?: string[];
}
export interface UiMatch {
  id: string; seed: string; status: string; winner: string | null; speed: number; apiCalls: number;
  error: { code: string; message: string; phase?: string; model?: string; reason?: string } | null;
  createdAt: string; updatedAt: string; finishedAt: string | null; ai?: string;
  llmProvider?: 'openai' | 'gemini';
  llmModel?: string;
  openaiReasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  geminiThinkingBudget?: number;
  ttsProvider?: 'voicevox' | 'aivisspeech';
  characters?: UiCharacter[];
}

export interface UiCharacter {
  seat: string;
  name: string;
  title: string;
  portraitSrc: string;
  llm: { provider: 'openai'; reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' }
    | { provider: 'gemini'; model: 'gemini-2.5-pro'; thinkingBudget: number }
    | { provider: 'gemini'; model: 'gemini-3.6-flash'; thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' }
    | { provider: 'gemini'; model: 'gemini-3.5-flash-lite'; thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' };
  tts: {
    provider: 'voicevox' | 'aivisspeech';
    voice: { seat: string; speakerId: number; speakerName: string; styleName: string; presentation: 'female' | 'male' | 'androgynous' };
  };
}
