import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { startLivePitchMonitor, type LivePitchMonitor } from '../lib/liveAudio';
import type { LivePitchFrame } from '../lib/livePitch';
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
  onRecordingChange?: (recording: boolean) => void;
  onLiveFrame?: (frame: LivePitchFrame) => void;
  onLiveError?: (message: string) => void;
}

export function Recorder({
  disabled,
  compact = false,
  busyLabel,
  onAudio,
  onError,
  onRecordingChange,
  onLiveFrame,
  onLiveError,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const monitor = useRef<LivePitchMonitor | null>(null);
  const captureGeneration = useRef(0);

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

  useEffect(() => () => {
    captureGeneration.current += 1;
    stream.current?.getTracks().forEach((track) => track.stop());
    void monitor.current?.stop();
  }, []);

  async function start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('This browser does not expose microphone recording. Use an audio file instead.');
      }
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      stream.current = media;
      const generation = captureGeneration.current + 1;
      captureGeneration.current = generation;
      chunks.current = [];
      elapsedRef.current = 0;
      setElapsed(0);
      const next = new MediaRecorder(media);
      next.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      next.onstop = () => {
        captureGeneration.current += 1;
        void monitor.current?.stop();
        monitor.current = null;
        const blob = new Blob(chunks.current, { type: next.mimeType });
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setRecording(false);
        onRecordingChange?.(false);
        onAudio(blob, `mic take · ${elapsedRef.current.toFixed(1)}s`);
      };
      recorder.current = next;
      next.start();
      setRecording(true);
      onRecordingChange?.(true);
      try {
        const liveMonitor = await startLivePitchMonitor(media, (frame) => onLiveFrame?.(frame));
        if (captureGeneration.current === generation && stream.current === media) {
          monitor.current = liveMonitor;
        } else {
          await liveMonitor.stop();
        }
      } catch (error) {
        onLiveError?.(error instanceof Error ? error.message : 'Live pitch preview could not start.');
      }
    } catch (error) {
      onRecordingChange?.(false);
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
          if (file) {
            onRecordingChange?.(false);
            onAudio(file, file.name);
          }
          event.target.value = '';
        }}
      />
    </div>
  );
}
