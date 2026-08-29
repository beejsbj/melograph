import { Panel } from './Panel';
import { Recorder } from './Recorder';

export type CaptureStatus = 'idle' | 'preparing' | 'analyzing';

interface Props {
  status: CaptureStatus;
  error?: string | null;
  onAudio: (blob: Blob, label: string) => void;
  onError?: (message: string) => void;
}

export function CapturePanel({ status, error, onAudio, onError }: Props) {
  return (
    <Panel className="capture-panel" eyebrow="new capture" title="Give the idea some room">
      <p className="capture-copy">Hum or sing one monophonic line. Leave a short silence between separate takes.</p>
      <Recorder
        disabled={status !== 'idle'}
        onAudio={onAudio}
        onError={onError}
      />
      {status !== 'idle' && (
        <div className="analysis-status" role="status">
          <span />
          <strong>{status === 'preparing' ? 'preparing clean audio' : 'drawing the melody'}</strong>
          <small>{status === 'analyzing' ? 'Praat is resolving contour and attacks' : 'resampling locally in your browser'}</small>
        </div>
      )}
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="capture-note">
        <span>note</span>
        <p><strong>No generative AI.</strong> The default path is deterministic Praat pitch analysis. Listen and edit before treating the notes as truth.</p>
      </div>
    </Panel>
  );
}
