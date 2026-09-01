import { Mic, Square } from 'lucide-react';

interface Props {
  recording?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function RecordButton({ recording = false, disabled = false, onClick }: Props) {
  return (
    <button
      type="button"
      className={`record-button ${recording ? 'record-button--live' : 'brass'}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={recording ? 'Stop recording' : 'Start recording'}
    >
      <span className="record-button__orbit" />
      {recording ? <Square size={26} fill="currentColor" /> : <Mic size={32} />}
    </button>
  );
}
