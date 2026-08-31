import { describe, expect, it } from 'vitest';
import { LiveMpmTracker } from './livePitch';

describe('LiveMpmTracker', () => {
  it('incrementally emits the shared frame contract for tone and silence', () => {
    const sampleRate = 48_000;
    const tone = Float32Array.from(
      { length: 6_144 },
      (_, index) => 0.35 * Math.sin(2 * Math.PI * 220 * index / sampleRate),
    );
    const silence = new Float32Array(2_048);
    const tracker = new LiveMpmTracker();
    const frames = [];

    for (let offset = 0; offset < tone.length; offset += 128) {
      frames.push(...tracker.push(tone.subarray(offset, offset + 128), sampleRate));
    }
    frames.push(...tracker.push(silence, sampleRate));

    expect(frames.some((frame) => frame.voiced && frame.note === 'A3')).toBe(true);
    expect(frames.at(-1)).toMatchObject({
      frequency_hz: null,
      midi: null,
      voiced: false,
      note: null,
    });
    expect(Object.keys(frames[0])).toEqual([
      'timestamp_seconds', 'frequency_hz', 'midi', 'clarity', 'voiced', 'note',
    ]);
    expect(frames[1].timestamp_seconds).toBeGreaterThan(frames[0].timestamp_seconds);
  });
});
