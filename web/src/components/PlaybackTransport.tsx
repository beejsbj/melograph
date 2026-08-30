import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatPlaybackTime, type PlaybackMode, synthesizeContour, synthesizeNotes } from '../lib/playback';
import { createStrudelPlayer, type StrudelPlayer } from '../lib/strudelPlayback';
import type { AnalysisResult } from '../types';
import { Button } from './Button';

interface Props {
  result: AnalysisResult;
  sourceAudio: Blob;
  strudelCode: string;
  mode: PlaybackMode;
  rangeStart: number;
  rangeEnd: number;
  onModeChange: (mode: PlaybackMode) => void;
  onTimeChange?: (time: number) => void;
}

const MODE_COPY: Record<PlaybackMode, string> = {
  voice: 'the exact audio sent to analysis',
  contour: 'continuous pitch after contour repair',
  notes: 'discrete interpreted note events',
  strudel: 'current editor code · loops independently',
};

export function PlaybackTransport({ result, sourceAudio, strudelCode, mode, rangeStart, rangeEnd, onModeChange, onTimeChange }: Props) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(rangeStart);
  const [error, setError] = useState<string | null>(null);
  const [strudelLoading, setStrudelLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const buffersRef = useRef(new Map<'contour' | 'notes', AudioBuffer>());
  const strudelPlayerRef = useRef<Promise<StrudelPlayer> | null>(null);
  const synthStartedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastVisualUpdateRef = useRef(0);
  const outputGenerationRef = useRef(0);
  const timeRef = useRef(rangeStart);
  const modeRef = useRef<PlaybackMode>(mode);
  const playingRef = useRef(false);
  const onTimeChangeRef = useRef(onTimeChange);

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const url = URL.createObjectURL(sourceAudio);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceAudio]);

  useEffect(() => () => {
    playingRef.current = false;
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current.disconnect();
    }
    void strudelPlayerRef.current?.then((player) => player.stop());
    void contextRef.current?.close();
  }, []);

  function commitTime(next: number) {
    const bounded = Math.max(rangeStart, Math.min(rangeEnd, next));
    timeRef.current = bounded;
    setTime(bounded);
    onTimeChangeRef.current?.(bounded);
  }

  function stopOutput() {
    outputGenerationRef.current += 1;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    audioRef.current?.pause();
    if (sourceRef.current) {
      const source = sourceRef.current;
      sourceRef.current = null;
      source.onended = null;
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    }
    void strudelPlayerRef.current?.then((player) => player.stop());
  }

  function currentOutputTime() {
    if (modeRef.current === 'voice') return audioRef.current?.currentTime ?? timeRef.current;
    if (modeRef.current === 'strudel') return 0;
    const context = contextRef.current;
    return context ? context.currentTime - synthStartedAtRef.current : timeRef.current;
  }

  function tick() {
    if (!playingRef.current) return;
    const next = currentOutputTime();
    if (next >= rangeEnd) {
      stopOutput();
      playingRef.current = false;
      setPlaying(false);
      commitTime(rangeEnd);
      return;
    }
    const now = performance.now();
    if (now - lastVisualUpdateRef.current >= 50) {
      lastVisualUpdateRef.current = now;
      commitTime(next);
    }
    rafRef.current = window.requestAnimationFrame(tick);
  }

  function finish() {
    stopOutput();
    playingRef.current = false;
    setPlaying(false);
    commitTime(rangeEnd);
  }

  function audioContext() {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      contextRef.current = new AudioContext();
      buffersRef.current.clear();
    }
    return contextRef.current;
  }

  function synthBuffer(selectedMode: 'contour' | 'notes', context: AudioContext) {
    const cached = buffersRef.current.get(selectedMode);
    if (cached) return cached;
    const samples = selectedMode === 'contour'
      ? synthesizeContour(result.frames, result.duration_seconds, context.sampleRate)
      : synthesizeNotes(result.phrases, result.duration_seconds, context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    buffersRef.current.set(selectedMode, buffer);
    return buffer;
  }

  async function strudelPlayer() {
    if (!strudelPlayerRef.current) {
      setStrudelLoading(true);
      strudelPlayerRef.current = createStrudelPlayer()
        .then((player) => {
          setStrudelLoading(false);
          return player;
        })
        .catch((caught) => {
          strudelPlayerRef.current = null;
          setStrudelLoading(false);
          throw caught;
        });
    }
    return strudelPlayerRef.current;
  }

  async function playAt(selectedMode: PlaybackMode, requestedTime: number) {
    stopOutput();
    const generation = outputGenerationRef.current;
    setError(null);
    const start = selectedMode === 'strudel' || requestedTime >= rangeEnd - 0.01 ? rangeStart : requestedTime;
    commitTime(start);
    try {
      if (selectedMode === 'voice') {
        const audio = audioRef.current;
        if (!audio || !sourceUrl) throw new Error('The source recording is not ready yet.');
        audio.currentTime = start;
        await audio.play();
        if (generation !== outputGenerationRef.current) {
          audio.pause();
          return;
        }
      } else if (selectedMode === 'strudel') {
        const player = await strudelPlayer();
        await player.play(strudelCode);
        if (generation !== outputGenerationRef.current) {
          player.stop();
          return;
        }
      } else {
        const context = audioContext();
        await context.resume();
        if (generation !== outputGenerationRef.current) return;
        const source = context.createBufferSource();
        source.buffer = synthBuffer(selectedMode, context);
        source.connect(context.destination);
        sourceRef.current = source;
        synthStartedAtRef.current = context.currentTime - start;
        source.start(0, start);
      }
      playingRef.current = true;
      setPlaying(true);
      if (selectedMode !== 'strudel') rafRef.current = window.requestAnimationFrame(tick);
    } catch (caught) {
      playingRef.current = false;
      setPlaying(false);
      setError(caught instanceof Error ? caught.message : 'Playback could not start.');
    }
  }

  function pause() {
    const pausedAt = currentOutputTime();
    stopOutput();
    playingRef.current = false;
    setPlaying(false);
    commitTime(pausedAt);
  }

  function selectMode(nextMode: PlaybackMode) {
    if (nextMode === modeRef.current) return;
    const wasPlaying = playingRef.current;
    const switchAt = wasPlaying ? currentOutputTime() : timeRef.current;
    stopOutput();
    playingRef.current = false;
    setPlaying(false);
    modeRef.current = nextMode;
    onModeChange(nextMode);
    if (nextMode === 'strudel') {
      commitTime(rangeStart);
      void strudelPlayer().catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Strudel playback could not load.');
      });
    }
    if (wasPlaying) void playAt(nextMode, switchAt);
  }

  function restart() {
    stopOutput();
    playingRef.current = false;
    setPlaying(false);
    if (audioRef.current) audioRef.current.currentTime = rangeStart;
    commitTime(rangeStart);
  }

  function seek(next: number) {
    stopOutput();
    playingRef.current = false;
    setPlaying(false);
    if (audioRef.current) audioRef.current.currentTime = next;
    commitTime(next);
  }

  return (
    <section className="audition" aria-label="Analysis playback">
      <audio ref={audioRef} src={sourceUrl || undefined} preload="auto" onEnded={finish} />
      <div className="audition__intro">
        <div>
          <span className="eyebrow">a / b audition</span>
          <strong>Hear each layer of the translation</strong>
        </div>
        <small>{MODE_COPY[mode]}</small>
      </div>
      <div className="audition__modes" role="group" aria-label="Playback layer">
        {(['voice', 'contour', 'notes', 'strudel'] as PlaybackMode[]).map((option) => (
          <button
            type="button"
            className={`audition__mode${mode === option ? ' audition__mode--active' : ''}`}
            aria-pressed={mode === option}
            onClick={() => selectMode(option)}
            key={option}
          >
            <span>{option}</span>
            <small>{option === 'voice' ? 'source' : option === 'contour' ? result.tracker : option === 'notes' ? 'events' : strudelLoading ? 'loading' : 'code'}</small>
          </button>
        ))}
      </div>
      <div className="audition__transport">
        <Button
          tone="brass"
          className="audition__play"
          icon={playing ? <Pause size={14} /> : <Play size={14} />}
          disabled={mode === 'strudel' && strudelLoading}
          onClick={() => (playing ? pause() : void playAt(modeRef.current, timeRef.current))}
        >
          {strudelLoading && mode === 'strudel' ? 'loading' : playing ? 'pause' : 'play'}
        </Button>
        <button type="button" className="audition__restart" onClick={restart} aria-label="Return to start">
          <RotateCcw size={14} />
        </button>
        <span className="audition__time">{mode === 'strudel' ? 'code' : formatPlaybackTime(time - rangeStart)}</span>
        <input
          aria-label="Playback position"
          type="range"
          min={rangeStart}
          max={rangeEnd}
          step="0.01"
          value={time}
          disabled={mode === 'strudel'}
          onChange={(event) => seek(Number(event.target.value))}
          style={{ '--progress': `${rangeEnd > rangeStart ? (time - rangeStart) / (rangeEnd - rangeStart) * 100 : 0}%` } as React.CSSProperties}
        />
        <span className="audition__time">{mode === 'strudel' ? 'loop' : formatPlaybackTime(rangeEnd - rangeStart)}</span>
      </div>
      {error && <p className="audition__error" role="alert">{error}</p>}
    </section>
  );
}
