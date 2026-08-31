import type { LivePitchFrame } from '../lib/livePitch';

interface Props {
  frames: LivePitchFrame[];
  error?: string | null;
}

export function LivePitchPreview({ frames, error }: Props) {
  const current = frames.at(-1);
  const recent = frames.slice(-180);
  const voicedMidi = recent.flatMap((frame) => frame.midi === null ? [] : [frame.midi]);
  const low = voicedMidi.length ? Math.floor(Math.min(...voicedMidi) - 2) : 48;
  const high = voicedMidi.length ? Math.ceil(Math.max(...voicedMidi) + 2) : 72;
  const span = Math.max(6, high - low);
  const start = recent[0]?.timestamp_seconds ?? 0;
  const end = recent.at(-1)?.timestamp_seconds ?? start + 1;
  const duration = Math.max(0.001, end - start);
  const points = recent.map((frame) => frame.midi === null ? null : {
    x: 8 + (frame.timestamp_seconds - start) / duration * 344,
    y: 82 - (frame.midi - low) / span * 68,
  });
  const paths: string[] = [];
  let path = '';
  for (const point of points) {
    if (!point) {
      if (path) paths.push(path);
      path = '';
    } else {
      path += `${path ? ' L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }
  }
  if (path) paths.push(path);

  return (
    <aside className="live-pitch">
      <header>
        <span>Pitchy / MPM · provisional</span>
        <strong>{current?.voiced ? current.note : '—'}</strong>
      </header>
      <svg viewBox="0 0 360 90" role="img" aria-label="Provisional live pitch contour">
        <path className="live-pitch__baseline" d="M8 82 H352" />
        {paths.map((value, index) => <path key={`${index}-${value}`} className="live-pitch__trace" d={value} />)}
      </svg>
      <footer>
        <span>{current?.voiced && current.frequency_hz ? `${current.frequency_hz.toFixed(1)} Hz` : 'listening for pitch'}</span>
        <span>clarity {Math.round((current?.clarity ?? 0) * 100)}%</span>
      </footer>
      {error && <p>{error} Recording continues; final Praat analysis is unaffected.</p>}
    </aside>
  );
}
