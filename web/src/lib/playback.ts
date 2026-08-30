import type { Frame, Phrase } from '../types';

export type PlaybackMode = 'voice' | 'contour' | 'notes';

const MAX_CONTOUR_GAP_SECONDS = 0.12;
const SYNTH_LEVEL = 0.16;

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function formatPlaybackTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

export function synthesizeContour(frames: Frame[], durationSeconds: number, sampleRate: number) {
  const length = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  const samples = new Float32Array(length);
  const midiAtSample = new Float32Array(length);
  const voiced = new Uint8Array(length);

  for (let index = 0; index < frames.length - 1; index += 1) {
    const current = frames[index];
    const next = frames[index + 1];
    if (current.midi_processed === null || next.midi_processed === null) continue;
    const interval = next.time_seconds - current.time_seconds;
    if (interval <= 0 || interval > MAX_CONTOUR_GAP_SECONDS) continue;

    const start = clampSample(current.time_seconds, sampleRate, length);
    const end = clampSample(next.time_seconds, sampleRate, length);
    for (let sample = start; sample < end; sample += 1) {
      const progress = (sample / sampleRate - current.time_seconds) / interval;
      midiAtSample[sample] = current.midi_processed + (next.midi_processed - current.midi_processed) * progress;
      voiced[sample] = 1;
    }
  }

  let phase = 0;
  let gain = 0;
  const attack = 1 - Math.exp(-1 / (sampleRate * 0.004));
  const release = 1 - Math.exp(-1 / (sampleRate * 0.012));
  for (let sample = 0; sample < length; sample += 1) {
    const target = voiced[sample] ? SYNTH_LEVEL : 0;
    gain += (target - gain) * (target > gain ? attack : release);
    if (voiced[sample]) phase += 2 * Math.PI * midiToFrequency(midiAtSample[sample]) / sampleRate;
    samples[sample] = Math.sin(phase) * gain;
  }
  return samples;
}

export function synthesizeNotes(phrases: Phrase[], durationSeconds: number, sampleRate: number) {
  const length = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  const samples = new Float32Array(length);
  const notes = phrases.flatMap((phrase) => phrase.events).filter(
    (event) => event.type === 'note' && typeof event.midi === 'number' && Number.isFinite(event.midi),
  );

  notes.forEach((event) => {
    const start = clampSample(event.start_seconds, sampleRate, length);
    const end = clampSample(event.end_seconds, sampleRate, length);
    const duration = Math.max(0, (end - start) / sampleRate);
    const attackSeconds = Math.min(0.012, duration / 3);
    const releaseSeconds = Math.min(0.028, duration / 3);
    const frequency = midiToFrequency(event.midi as number);

    for (let sample = start; sample < end; sample += 1) {
      const localTime = (sample - start) / sampleRate;
      const remaining = (end - sample) / sampleRate;
      const attack = attackSeconds ? Math.min(1, localTime / attackSeconds) : 1;
      const release = releaseSeconds ? Math.min(1, remaining / releaseSeconds) : 1;
      const envelope = Math.min(attack, release);
      const phase = 2 * Math.PI * frequency * localTime;
      samples[sample] += (Math.sin(phase) + Math.sin(phase * 2) * 0.16) * SYNTH_LEVEL * envelope;
    }
  });

  return samples;
}

function clampSample(seconds: number, sampleRate: number, length: number) {
  return Math.max(0, Math.min(length, Math.round(seconds * sampleRate)));
}
