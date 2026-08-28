# Voice to Strudel

Voice to Strudel turns a monophonic hum or sung phrase into three things you can
inspect and change: the raw pitch contour, phrase-separated note events, and
numeric `note(...)` patterns for the Strudel REPL. It keeps each take separate;
it does not average repeated motifs into one supposedly canonical melody.

The default tracker is Praat autocorrelation. It is CPU-first, runs locally, and
keeps the source recording beside every derived artifact. Human listening is
the acceptance test; confidence values are diagnostics, not truth.

## Install

Python 3.11+ and `ffmpeg` are required. `ffmpeg` decodes WAV/M4A and records from
the microphone without adding an audio framework to the Python process.

```bash
cd /path/to/voice-to-strudel
uv sync --extra test
```

## Capture

One command accepts WAV or M4A:

```bash
uv run voice-to-strudel capture melody.m4a --out out/melody
```

Or record a fixed-length microphone take:

```bash
uv run voice-to-strudel capture mic --seconds 12 --out out/mic-take
```

The output directory contains:

- `source.wav`: the preserved, normalized analysis copy (the input is untouched)
- `contour.csv`: time, F0, MIDI, confidence, voicing, and energy per frame
- `analysis.json`: editable phrase boundaries and note events
- `strudel.js`: directly runnable numeric-note patterns
- `audition.html`: local A/B players for every phrase
- `contour-synth.wav`: a sine rendering that follows the tracked contour
- `synth.wav`: a quantized sine rendering of the editable note events

In `analysis.json`, event and phrase `start_seconds`/`end_seconds` plus event
`midi` and `type` are authoritative. To add or remove an attack, split or merge
events; `duration_seconds`, confidence, attack source, and gesture are derived
diagnostics. Invalid overlaps or events outside an edited phrase are rejected
rather than silently time-stretched. Rebuild without tracking the audio again:

```bash
uv run voice-to-strudel render out/melody/analysis.json
```

## Benchmark

The optional fusion lane is deliberately a benchmark candidate, not the
default. It keeps a frame only when Praat and aubio agree within a cents gate.

```bash
uv sync --extra fusion --extra test
uv run voice-to-strudel benchmark melody.wav --out out/benchmark.json
```

The report records wall time, peak RSS, voicing coverage, octave-error candidates,
contour disagreement, and the optional listening preference supplied with
`--preference`. It also writes `<report-stem>-audition/index.html` with source,
Praat, and fusion players for every take, plus a direct link to the generated
Praat `strudel.js`. Fusion should not become the product default unless listening
justifies its extra cost.

The named pilot fixture and current result are recorded in
[`docs/pilot-benchmark.md`](docs/pilot-benchmark.md).

## Limits

- Input must be monophonic; accompaniment and polyphony are out of scope.
- Note boundaries are candidates. Legato re-attacks without an energy dip may
  need a manual edit.
- Slides and vibrato remain in `contour.csv` and `contour-synth.wav`; the event
  summary records their pitch span, while ordinary Strudel notes necessarily
  reduce each gesture to one editable centre pitch.
- Microphone capture depends on an `ffmpeg` input device (`pulse`/`alsa` on
  Linux, `avfoundation` on macOS). Use a recorded file if device discovery fails.

## Dependency licences

- Voice to Strudel: GPL-3.0-or-later
- NumPy: BSD-3-Clause
- Parselmouth: GPL-3.0-or-later (Praat itself is GPL-3.0-or-later)
- aubio, optional fusion benchmark: GPL-3.0-or-later
- ffmpeg: build-dependent; the host binary may be LGPL or GPL
