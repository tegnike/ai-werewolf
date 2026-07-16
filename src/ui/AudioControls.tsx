export function AudioControls({
  bgmEnabled, voiceEnabled, voiceAvailable, speakingSeat, onBgmChange, onVoiceChange, compact = false,
}: {
  bgmEnabled: boolean; voiceEnabled?: boolean; voiceAvailable?: boolean | null; speakingSeat?: string | null;
  onBgmChange: (value: boolean) => void; onVoiceChange?: (value: boolean) => void; compact?: boolean;
}) {
  return (
    <div className={`audio-controls ${compact ? 'compact' : ''}`} aria-label="サウンド設定">
      <button className={bgmEnabled ? 'on' : ''} onClick={() => onBgmChange(!bgmEnabled)} aria-pressed={bgmEnabled} title="BGMを切り替え">
        <span>♫</span> BGM {bgmEnabled ? 'ON' : 'OFF'}
      </button>
      {onVoiceChange && <button className={voiceEnabled ? 'on' : ''} onClick={() => onVoiceChange(!voiceEnabled)} aria-pressed={voiceEnabled} title={voiceAvailable === false ? 'VOICEVOXへ接続できません' : 'VOICEVOX読み上げを切り替え'}>
        <span>{speakingSeat ? '◉' : '◌'}</span> VOICE {voiceEnabled ? 'ON' : 'OFF'}{voiceAvailable === false ? ' !' : ''}
      </button>}
    </div>
  );
}
