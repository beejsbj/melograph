import type { CaptureStatus } from './Recorder';

export function AnalysisOverlay({ status }: { status: Exclude<CaptureStatus, 'idle'> }) {
  return (
    <div className="analysis-overlay" role="status" aria-live="polite">
      <div className="analysis-overlay__signal"><span /><span /><span /></div>
      <span className="eyebrow">capture in translation</span>
      <strong>{status === 'preparing' ? 'Preparing clean audio' : 'Drawing the melody'}</strong>
      <small>{status === 'analyzing' ? 'Praat is resolving contour and attacks' : 'Resampling locally in your browser'}</small>
    </div>
  );
}
