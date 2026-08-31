import type { CaptureStatus } from './Recorder';
import { Recorder } from './Recorder';
import type { LivePitchFrame } from '../lib/livePitch';

interface Props {
  status: CaptureStatus;
  error?: string | null;
  onAudio: (blob: Blob, label: string) => void;
  onError?: (message: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  onLiveFrame?: (frame: LivePitchFrame) => void;
  onLiveError?: (message: string) => void;
}

export function CaptureNotch({
  status,
  error,
  onAudio,
  onError,
  onRecordingChange,
  onLiveFrame,
  onLiveError,
}: Props) {
  return (
    <div className={`capture-notch capture-notch--${status}${error ? ' capture-notch--error' : ''}`}>
      <Recorder
        compact
        disabled={status !== 'idle'}
        busyLabel={status === 'preparing' ? 'preparing audio' : status === 'analyzing' ? 'drawing melody' : undefined}
        onAudio={onAudio}
        onError={onError}
        onRecordingChange={onRecordingChange}
        onLiveFrame={onLiveFrame}
        onLiveError={onLiveError}
      />
      {error && <span className="capture-notch__error">capture needs attention</span>}
    </div>
  );
}
