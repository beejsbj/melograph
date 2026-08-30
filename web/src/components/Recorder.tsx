import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { RecordButton } from './RecordButton';

const MAX_SECONDS = 45;

export type CaptureStatus = 'idle' | 'preparing' | 'analyzing';

interface Props {
  disabled?: boolean;
  compact?: boolean;
  busyLabel?: string;
  onAudio: (blob: Blob, label: string) => void;
  onError?: (message: string) => void;
}

export function Recorder({ disabled, compact = false, busyLabel, onAudio, onError }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((value) => {
      const next = value + 0.1;
      elapsedRef.current = next;
      return next;
    }), 100);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (elapsed >= MAX_SECONDS && recording) recorder.current?.stop();
  }, [elapsed, recording]);

  useEffect(() => () => stream.current?.getTracks().forEach((track) => track.stop()), []);

  async function start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('This browser does not expose microphone recording. Use an audio file instead.');
      }
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      stream.current = media;
      chunks.current = [];
      elapsedRef.current = 0;
      setElapsed(0);
      const next = new MediaRecorder(media);
      next.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      next.onstop = () => {
        const blob = new Blob(chunks.current, { type: next.mimeType });
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setRecording(false);
        onAudio(blob, `mic take · ${elapsedRef.current.toFixed(1)}s`);
      };
      recorder.current = next;
      next.start();
      setRecording(true);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Microphone access failed.');
    }
  }

  function stop() {
    recorder.current?.stop();
  }

  return (
    <div className={`recorder${compact ? ' recorder--notch' : ''}`}>
      <RecordButton
        recording={recording}
        onClick={() => (recording ? stop() : void start())}
        disabled={disabled}
      />
      <div className="recorder__readout">
        <strong>{recording ? 'listening' : busyLabel ?? 'ready when the idea is'}</strong>
        <span>{recording ? `${elapsed.toFixed(1)} / ${MAX_SECONDS}s` : busyLabel ? 'hold on to the phrase' : 'tap once, hum, tap again'}</span>
      </div>
      <div className="recorder__rule"><span style={{ width: `${Math.min(100, elapsed / MAX_SECONDS * 100)}%` }} /></div>
      <Button className="recorder__file" type="button" icon={<Upload size={14} />} disabled={disabled || recording} onClick={() => fileInput.current?.click()} aria-label="Use an audio file">
        {compact ? 'file' : 'use an audio file'}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.wav,.m4a"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onAudio(file, file.name);
          event.target.value = '';
        }}
      />
    </div>
  );
}
