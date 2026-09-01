#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [sourceArgument, praatContourArgument, praatSynthArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !praatContourArgument || !praatSynthArgument || !outputArgument) {
  console.error('usage: node scripts/pilot-live-pitch.mjs SOURCE_WAV PRAAT_CONTOUR_CSV PRAAT_SYNTH_WAV OUTPUT_DIR');
  process.exit(2);
}

const sourcePath = resolve(sourceArgument);
const praatContourPath = resolve(praatContourArgument);
const praatSynthPath = resolve(praatSynthArgument);
const outputDir = resolve(outputArgument);
const buildDir = resolve(webRoot, '.pilot-live-build');

rmSync(buildDir, { force: true, recursive: true });
try {
  execFileSync(resolve(webRoot, 'node_modules/.bin/tsc'), [
    '--outDir', buildDir,
    '--noEmit', 'false',
    '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext',
    '--target', 'ES2022',
    '--skipLibCheck',
    resolve(webRoot, 'src/lib/livePitch.ts'),
  ]);
  const { LiveMpmTracker } = await import(pathToFileURL(resolve(buildDir, 'livePitch.js')));
  const { samples, sampleRate } = readMono16Wav(sourcePath);
  const tracker = new LiveMpmTracker();
  const frames = [];
  for (let offset = 0; offset < samples.length; offset += 2_048) {
    frames.push(...tracker.push(samples.subarray(offset, offset + 2_048), sampleRate));
  }

  const praat = readPraatContour(praatContourPath);
  const disagreements = frames
    .filter((frame) => frame.voiced)
    .map((frame) => {
      const reference = nearestPraatFrame(praat, frame.timestamp_seconds - 1_024 / sampleRate);
      return reference ? Math.abs(100 * (frame.midi - reference.midi)) : null;
    })
    .filter((value) => value !== null);
  disagreements.sort((left, right) => left - right);

  const summary = {
    fixture_seconds: samples.length / sampleRate,
    frame_size: 2_048,
    frames: frames.length,
    voiced_frames: frames.filter((frame) => frame.voiced).length,
    voiced_percent: round(100 * frames.filter((frame) => frame.voiced).length / frames.length, 2),
    voiced_phrase_groups: countVoicedGroups(frames, 0.65),
    comparable_frames: disagreements.length,
    median_absolute_disagreement_cents: round(percentile(disagreements, 0.5), 1),
    disagreement_over_80_cents: disagreements.filter((value) => value > 80).length,
    disagreement_over_600_cents: disagreements.filter((value) => value > 600).length,
  };

  mkdirSync(outputDir, { recursive: true });
  copyFileSync(sourcePath, resolve(outputDir, 'source.wav'));
  copyFileSync(praatSynthPath, resolve(outputDir, 'praat-contour.wav'));
  writeMono16Wav(
    resolve(outputDir, 'pitchy-contour.wav'),
    synthesizeFrames(frames, samples.length, sampleRate),
    sampleRate,
  );
  writeFileSync(resolve(outputDir, 'pitchy-frames.csv'), frameCsv(frames));
  writeFileSync(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(resolve(outputDir, 'index.html'), auditionHtml(summary));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  rmSync(buildDir, { force: true, recursive: true });
}

function readMono16Wav(path) {
  const wav = readFileSync(path);
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a WAV file`);
  }
  let offset = 12;
  let format;
  let pcm;
  while (offset + 8 <= wav.length) {
    const name = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (name === 'fmt ') format = wav.subarray(start, start + size);
    if (name === 'data') pcm = wav.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || !pcm || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || format.readUInt16LE(14) !== 16) {
    throw new Error(`${path} must be mono 16-bit PCM`);
  }
  const samples = new Float32Array(pcm.length / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = pcm.readInt16LE(index * 2) / 32_768;
  return { samples, sampleRate: format.readUInt32LE(4) };
}

function readPraatContour(path) {
  const [, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  return lines.flatMap((line) => {
    const fields = line.split(',');
    const time = Number(fields[0]);
    const midi = Number(fields[3]);
    return Number.isFinite(time) && fields[3] && Number.isFinite(midi) ? [{ time, midi }] : [];
  });
}

function nearestPraatFrame(frames, time) {
  let nearest = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    const candidate = Math.abs(frame.time - time);
    if (candidate < distance) {
      distance = candidate;
      nearest = frame;
    }
  }
  return distance <= 0.06 ? nearest : null;
}

function synthesizeFrames(frames, length, sampleRate) {
  const output = new Float32Array(length);
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const frame = frames[Math.min(Math.floor(index / 2_048), frames.length - 1)];
    if (frame?.voiced && frame.frequency_hz) {
      phase += 2 * Math.PI * frame.frequency_hz / sampleRate;
      output[index] = 0.16 * Math.sin(phase);
    }
  }
  return output;
}

function writeMono16Wav(path, samples, sampleRate) {
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  for (let index = 0; index < samples.length; index += 1) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[index])) * 32_767), 44 + index * 2);
  }
  writeFileSync(path, wav);
}

function frameCsv(frames) {
  const header = 'timestamp_seconds,frequency_hz,midi,clarity,voiced,note';
  const rows = frames.map((frame) => [
    frame.timestamp_seconds,
    frame.frequency_hz ?? '',
    frame.midi ?? '',
    frame.clarity,
    frame.voiced ? 1 : 0,
    frame.note ?? '',
  ].join(','));
  return `${[header, ...rows].join('\n')}\n`;
}

function auditionHtml(summary) {
  const rows = [
    ['Source', 'source.wav'],
    ['Praat final contour', 'praat-contour.wav'],
    ['Pitchy provisional contour', 'pitchy-contour.wav'],
  ].map(([label, source]) => `<p><strong>${label}</strong><br><audio controls src="${source}"></audio></p>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Melograph live pilot</title><main><h1>Live tracker pilot</h1>${rows}<pre>${JSON.stringify(summary, null, 2)}</pre></main>`;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function countVoicedGroups(frames, maximumGapSeconds) {
  let groups = 0;
  let lastVoiced = Number.NEGATIVE_INFINITY;
  for (const frame of frames) {
    if (!frame.voiced) continue;
    if (frame.timestamp_seconds - lastVoiced > maximumGapSeconds) groups += 1;
    lastVoiced = frame.timestamp_seconds;
  }
  return groups;
}

function round(value, decimals) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
