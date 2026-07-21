export function AudioControls({
  bgmEnabled, bgmVolume, voiceEnabled, voiceVolume, voiceAvailable, speakingSeat,
  sfxEnabled, sfxVolume, onBgmChange, onBgmVolumeChange, onVoiceChange, onVoiceVolumeChange, onSfxChange, onSfxVolumeChange, compact = false,
}: {
  bgmEnabled: boolean; bgmVolume: number; voiceEnabled?: boolean; voiceVolume?: number; voiceAvailable?: boolean | null; speakingSeat?: string | null;
  sfxEnabled?: boolean; sfxVolume?: number;
  onBgmChange: (value: boolean) => void; onBgmVolumeChange: (value: number) => void;
  onVoiceChange?: (value: boolean) => void; onVoiceVolumeChange?: (value: number) => void;
  onSfxChange?: (value: boolean) => void; onSfxVolumeChange?: (value: number) => void; compact?: boolean;
}) {
  return (
    <div className={`audio-controls ${compact ? 'compact' : ''}`} aria-label="サウンド設定">
      <button className={bgmEnabled ? 'on' : ''} onClick={() => onBgmChange(!bgmEnabled)} aria-pressed={bgmEnabled} title="BGMを切り替え">
        <span>♫</span> BGM {bgmEnabled ? 'ON' : 'OFF'}
      </button>
      <label className="volume-control"><span>BGM</span><input aria-label="BGM音量" type="range" min="0" max="100" value={Math.round(bgmVolume * 100)} onChange={(event) => onBgmVolumeChange(Number(event.target.value) / 100)} /><output>{Math.round(bgmVolume * 100)}</output></label>
      {onVoiceChange && <button className={voiceEnabled ? 'on' : ''} onClick={() => onVoiceChange(!voiceEnabled)} aria-pressed={voiceEnabled} title={voiceAvailable === false ? '音声エンジンへ接続できません' : '音声読み上げを切り替え'}>
        <span>{speakingSeat ? '◉' : '◌'}</span> VOICE {voiceEnabled ? 'ON' : 'OFF'}{voiceAvailable === false ? ' !' : ''}
      </button>}
      {onVoiceVolumeChange && <label className="volume-control"><span>VOICE</span><input aria-label="VOICE音量" type="range" min="0" max="100" value={Math.round((voiceVolume ?? 0.9) * 100)} onChange={(event) => onVoiceVolumeChange(Number(event.target.value) / 100)} /><output>{Math.round((voiceVolume ?? 0.9) * 100)}</output></label>}
      {onSfxChange && <button className={sfxEnabled ? 'on' : ''} onClick={() => onSfxChange(!sfxEnabled)} aria-pressed={sfxEnabled} title="画面演出の効果音を切り替え">
        <span>◆</span> SE {sfxEnabled ? 'ON' : 'OFF'}
      </button>}
      {onSfxVolumeChange && <label className="volume-control"><span>SE</span><input aria-label="SE音量" type="range" min="0" max="100" value={Math.round((sfxVolume ?? 0.8) * 100)} onChange={(event) => onSfxVolumeChange(Number(event.target.value) / 100)} /><output>{Math.round((sfxVolume ?? 0.8) * 100)}</output></label>}
    </div>
  );
}
