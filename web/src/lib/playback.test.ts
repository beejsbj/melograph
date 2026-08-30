import { describe, expect, it } from 'vitest';
import type { Frame, Phrase } from '../types';
import { formatPlaybackTime, midiToFrequency, synthesizeContour, synthesizeNotes } from './playback';

const frame = (time: number, midi: number | null): Frame => ({
  time_seconds: time,
  f0_hz_raw: midi === null ? null : 440,
  midi_raw: midi,
  midi_processed: midi,
  confidence: midi === null ? 0 : 1,
  voiced: midi !== null,
  rms_db: -12,
});

describe('playback synthesis', () => {
  it('renders voiced contour intervals while preserving unvoiced gaps', () => {
    const samples = synthesizeContour([
      frame(0, 69), frame(0.1, 69), frame(0.2, null), frame(0.3, 72), frame(0.4, 72),
    ], 0.5, 1_000);

    expect(samples).toHaveLength(500);
    expect(Math.max(...samples.slice(25, 75).map(Math.abs))).toBeGreaterThan(0.1);
    expect(Math.max(...samples.slice(235, 265).map(Math.abs))).toBeLessThan(0.01);
    expect(Math.max(...samples.slice(325, 375).map(Math.abs))).toBeGreaterThan(0.1);
  });

  it('renders note events but leaves rests silent', () => {
    const phrases: Phrase[] = [{
      number: 1,
      start_seconds: 0,
      end_seconds: 1,
      duration_seconds: 1,
      events: [
        { type: 'note', start_seconds: 0, end_seconds: 0.25, duration_seconds: 0.25, midi: 69, note: 'A4' },
        { type: 'rest', start_seconds: 0.25, end_seconds: 0.75, duration_seconds: 0.5 },
      ],
    }];
    const samples = synthesizeNotes(phrases, 1, 1_000);

    expect(Math.max(...samples.slice(20, 200).map(Math.abs))).toBeGreaterThan(0.1);
    expect(samples.slice(300, 700).every((sample) => sample === 0)).toBe(true);
  });

  it('formats transport values and pitches predictably', () => {
    expect(formatPlaybackTime(65.9)).toBe('1:05');
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
    expect(midiToFrequency(69)).toBe(440);
  });
});
