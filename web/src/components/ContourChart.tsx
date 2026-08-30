import type { AnalysisResult, Frame, Phrase } from '../types';

const WIDTH = 1000;
const HEIGHT = 360;
const LEFT = 52;
const RIGHT = 18;
const TOP = 22;
const BOTTOM = 34;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface Props {
  result: Pick<AnalysisResult, 'frames' | 'phrases' | 'duration_seconds'>;
  playheadSeconds?: number;
  rangeStart?: number;
  rangeEnd?: number;
}

export function ContourChart({ result, playheadSeconds, rangeStart = 0, rangeEnd = result.duration_seconds }: Props) {
  const duration = Math.max(.01, rangeEnd - rangeStart);
  const frames = result.frames.filter((frame) => frame.time_seconds >= rangeStart && frame.time_seconds <= rangeEnd);
  const pitches = frames.flatMap((frame) => [frame.midi_raw, frame.midi_processed]).filter(isNumber);
  const lowest = pitches.length ? Math.floor(Math.min(...pitches)) - 1 : 47;
  const highest = pitches.length ? Math.ceil(Math.max(...pitches)) + 1 : 59;
  const span = Math.max(8, highest - lowest);
  const top = lowest + span;
  const x = (time: number) => LEFT + (time - rangeStart) / duration * (WIDTH - LEFT - RIGHT);
  const y = (midi: number) => TOP + (top - midi) / span * (HEIGHT - TOP - BOTTOM);
  const raw = pathSegments(frames, 'midi_raw', x, y);
  const repaired = pathSegments(frames, 'midi_processed', x, y);

  return (
    <div className="chart" role="img" aria-label="Raw pitch contour and interpreted note events over time">
      <span className="chart__mobile-hint" aria-hidden="true">swipe to inspect →</span>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="note-fill" x1="0" x2="1">
            <stop offset="0" stopColor="var(--brass)" stopOpacity=".22" />
            <stop offset="1" stopColor="var(--brass-hot)" stopOpacity=".08" />
          </linearGradient>
        </defs>
        {Array.from({ length: span + 1 }, (_, index) => lowest + index).map((midi) => (
          <g key={midi}>
            <line className={midi % 12 === 0 ? 'chart__grid chart__grid--octave' : 'chart__grid'} x1={LEFT} x2={WIDTH - RIGHT} y1={y(midi)} y2={y(midi)} />
            <text className="chart__label" x={LEFT - 9} y={y(midi) + 4}>{noteName(midi)}</text>
          </g>
        ))}
        {timeTicks(duration).map((time) => (
          <g key={time}>
            <line className="chart__tick" x1={x(rangeStart + time)} x2={x(rangeStart + time)} y1={TOP} y2={HEIGHT - BOTTOM} />
            <text className="chart__time" x={x(rangeStart + time)} y={HEIGHT - 10}>{time.toFixed(time < 10 ? 1 : 0)}s</text>
          </g>
        ))}
        <NoteBlocks phrases={result.phrases} x={x} y={y} />
        {raw.map((path, index) => <path className="chart__raw" d={path} key={`raw-${index}`} />)}
        {repaired.map((path, index) => <path className="chart__repaired" d={path} key={`repaired-${index}`} />)}
        {playheadSeconds !== undefined && (
          <line
            className="chart__playhead"
            x1={x(Math.max(rangeStart, Math.min(rangeEnd, playheadSeconds)))}
            x2={x(Math.max(rangeStart, Math.min(rangeEnd, playheadSeconds)))}
            y1={TOP}
            y2={HEIGHT - BOTTOM}
          />
        )}
      </svg>
      <div className="chart__legend">
        <span><i className="legend-line legend-line--raw" />raw voice</span>
        <span><i className="legend-line legend-line--clean" />interpreted contour</span>
        <span><i className="legend-block" />note event</span>
      </div>
    </div>
  );
}

function NoteBlocks({ phrases, x, y }: { phrases: Phrase[]; x: (value: number) => number; y: (value: number) => number }) {
  return phrases.flatMap((phrase) => phrase.events.map((event, index) => {
    if (event.type !== 'note' || event.midi === undefined) return null;
    const blockHeight = 13;
    return (
      <g key={`${phrase.number}-${index}`}>
        <rect
          className="chart__note"
          x={x(event.start_seconds)}
          y={y(event.midi) - blockHeight / 2}
          width={Math.max(2, x(event.end_seconds) - x(event.start_seconds))}
          height={blockHeight}
          rx="2"
        >
          <title>{event.note} · {event.duration_seconds.toFixed(2)}s</title>
        </rect>
      </g>
    );
  }));
}

function pathSegments(
  frames: Frame[],
  key: 'midi_raw' | 'midi_processed',
  x: (value: number) => number,
  y: (value: number) => number,
) {
  const paths: string[] = [];
  let current = '';
  frames.forEach((frame) => {
    const pitch = frame[key];
    if (pitch === null) {
      if (current) paths.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${x(frame.time_seconds).toFixed(2)},${y(pitch).toFixed(2)} `;
  });
  if (current) paths.push(current);
  return paths;
}

function noteName(midi: number) {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

function timeTicks(duration: number) {
  const step = duration > 20 ? 5 : duration > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let time = 0; time <= duration; time += step) ticks.push(time);
  return ticks;
}
