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
    if (elapsed >= MAX_SECONDS && recording) stop();
  }, [elapsed, recording]);

  useEffect(() => () => {
    void releaseCapture(stream.current, recorder.current, false);
  }, []);

  async function start() {
    let acquired: MediaStream | null = null;
    let activeRecorder: MediaRecorder | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('This browser does not expose microphone recording. Use an audio file instead.');
      }
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      acquired = media;
      stream.current = media;
      const generation = captureGeneration.current + 1;
      captureGeneration.current = generation;
      chunks.current = [];
      elapsedRef.current = 0;
      setElapsed(0);
      const next = new MediaRecorder(media);
      activeRecorder = next;
      next.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      next.onstop = () => {
        if (captureGeneration.current !== generation) return;
        const blob = new Blob(chunks.current, { type: next.mimeType });
        void releaseCapture(media, next).then(() => {
          onAudio(blob, `mic take · ${elapsedRef.current.toFixed(1)}s`);
        });
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
      if (acquired) {
        await releaseCapture(acquired, activeRecorder);
      } else {
        setRecording(false);
        onRecordingChange?.(false);
      }
      onError?.(error instanceof Error ? error.message : 'Microphone access failed.');
    }
  }

  function stop() {
    const active = recorder.current;
    if (!active || !recorderIsActive(active)) return;
    try {
      active.stop();
    } catch (error) {
      if (!recorderIsActive(active)) return;
      void releaseCapture(stream.current, active, false);
      onError?.(error instanceof Error ? error.message : 'Microphone recording could not stop.');
    }
  }

  async function releaseCapture(
    media: MediaStream | null,
    active: MediaRecorder | null,
    notify = true,
  ) {
    captureGeneration.current += 1;
    if (recorder.current === active) recorder.current = null;
    if (stream.current === media) stream.current = null;

    if (active && recorderIsActive(active)) {
      try {
        active.stop();
      } catch {
        // Stopping a recorder that has just transitioned to inactive is harmless.
      }
    }
    for (const track of media?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // Keep releasing the remaining tracks if one browser implementation rejects stop().
      }
    }
    const activeMonitor = monitor.current;
    monitor.current = null;
    await activeMonitor?.stop().catch(() => undefined);
    chunks.current = [];
    if (notify) {
      setRecording(false);
      onRecordingChange?.(false);
    }
  }

  function recorderIsActive(active: MediaRecorder) {
    return active.state !== 'inactive';
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
