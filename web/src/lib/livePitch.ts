import { PitchDetector } from 'pitchy';

export interface LivePitchFrame {
  timestamp_seconds: number;
  frequency_hz: number | null;
  midi: number | null;
  clarity: number;
  voiced: boolean;
  note: string | null;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class LiveMpmTracker {
  private readonly detector: PitchDetector<Float32Array>;
  private readonly buffer: Float32Array;
  private buffered = 0;
  private observedSamples = 0;

  constructor(
    private readonly frameSize = 2_048,
    private readonly clarityGate = 0.8,
    private readonly rmsGate = 0.003,
    private readonly floorHz = 65,
    private readonly ceilingHz = 1_050,
  ) {
    this.detector = PitchDetector.forFloat32Array(frameSize);
    this.buffer = new Float32Array(frameSize);
  }

  push(input: Float32Array, sampleRate: number): LivePitchFrame[] {
    const frames: LivePitchFrame[] = [];
    let offset = 0;
    while (offset < input.length) {
      const count = Math.min(this.frameSize - this.buffered, input.length - offset);
      this.buffer.set(input.subarray(offset, offset + count), this.buffered);
      this.buffered += count;
      this.observedSamples += count;
      offset += count;
      if (this.buffered !== this.frameSize) continue;
      frames.push(this.analyze(sampleRate));
      this.buffered = 0;
    }
    return frames;
  }

  private analyze(sampleRate: number): LivePitchFrame {
    const [frequency, clarity] = this.detector.findPitch(this.buffer, sampleRate);
    const rms = Math.sqrt(this.buffer.reduce((sum, sample) => sum + sample * sample, 0) / this.frameSize);
    const voiced = Number.isFinite(frequency)
      && frequency >= this.floorHz
      && frequency <= this.ceilingHz
      && clarity >= this.clarityGate
      && rms >= this.rmsGate;
    const midi = voiced ? 69 + 12 * Math.log2(frequency / 440) : null;
    return {
      timestamp_seconds: round(this.observedSamples / sampleRate, 6),
      frequency_hz: voiced ? round(frequency, 4) : null,
      midi: midi === null ? null : round(midi, 4),
      clarity: round(Number.isFinite(clarity) ? Math.max(0, Math.min(1, clarity)) : 0, 4),
      voiced,
      note: midi === null ? null : midiToNote(midi),
    };
  }
}

function midiToNote(midi: number): string {
  const nearest = Math.floor(midi + 0.5);
  return `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`;
}

function round(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
