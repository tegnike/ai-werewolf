import type { CSSProperties } from 'react';
import type { CinematicCue } from './cinematic';

export function CinematicOverlay({ cue }: { cue: CinematicCue | null }) {
  if (!cue) return null;
  return (
    <section className={`cinematic-overlay ${cue.tone}`} aria-live="assertive" aria-atomic="true" key={`${cue.seq}:${cue.title}`} style={{ '--cinematic-duration': `${cue.durationMs}ms` } as CSSProperties}>
      <div className="cinematic-shutter top" />
      <div className={`cinematic-copy ${cue.voteResults ? 'vote-result-copy' : ''}`}>
        <span>{cue.eyebrow}</span>
        <h2>{cue.title}</h2>
        {cue.voteResults && <div className="cinematic-vote-results">
          {cue.voteResults.map((result) => <div className={result.leading ? 'leading' : ''} key={result.seat}>
            <strong>{result.name}</strong><em>{result.count}票</em>
          </div>)}
        </div>}
        <p>{cue.subtitle}</p>
      </div>
      <div className="cinematic-shutter bottom" />
    </section>
  );
}
