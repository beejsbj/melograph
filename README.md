# Melograph

[Open Melograph](https://melograph-swart.vercel.app/) · [Source on GitHub](https://github.com/beejsbj/melograph)

Melograph turns a monophonic hum or sung phrase into three things you can
inspect and change: the raw pitch contour, phrase-separated note events, and
numeric `note(...)` patterns for the Strudel REPL. It keeps each take separate;
it does not average repeated motifs into one supposedly canonical melody.

In the CLI, the default tracker is Praat autocorrelation. It is CPU-first, runs
locally, and keeps the source recording beside every derived artifact. Human
listening is the acceptance test; confidence values are diagnostics, not truth.

pYIN is available as an optional alternate interpretation. It is useful for
comparing ambiguous or noisy monophonic takes, but it is not fused with Praat
and is not assumed to be more accurate.

## Web app

Melograph's browser app turns voice into a continuous contour, named note events,
JSON-compatible analysis data, and editable Strudel code as the first-party
output. The CLI exposes the same durable analysis pipeline and keeps the artifact
model useful for other outputs later.

From a source checkout with Node.js, npm, and the Vercel CLI installed, run the
React recording bench locally:

```bash
vercel dev
```

The page records up to 45 seconds from the browser microphone or accepts an audio
file. Audio is decoded and normalized to mono 22,050 Hz PCM WAV in the browser,
then sent to `/api/analyze`; it is not persisted by the function. The result shows
the raw and repaired contours together, phrase-separated note names and timing,
and one editable/open-in-Strudel code surface per take. A synchronized audition
transport lets you compare the analyzed source, repaired contour, and interpreted
note events without uploading another artifact. `/styleguide` exposes the same
imported design primitives and contour composition used by the app.

The API rejects request bodies over 4 MB. The 45-second browser limit keeps mono
22,050 Hz 16-bit PCM below 2 MB, comfortably under that limit.

## Install

For the Python CLI, Python 3.11+, [uv](https://docs.astral.sh/uv/), and `ffmpeg`
are required. `ffmpeg` decodes WAV/M4A and records from the microphone without
adding an audio framework to the Python process.

Install the current GitHub version as a persistent `melograph` command:

```bash
uv tool install git+https://github.com/beejsbj/melograph
melograph --help
```

The Python distribution retains the legacy name `voice-to-strudel`; its
canonical command is `melograph`, with `voice-to-strudel` kept as an alias for
existing scripts. Upgrade it later with `uv tool upgrade voice-to-strudel`.

To work from a source checkout instead:

```bash
git clone https://github.com/beejsbj/melograph.git
cd melograph
uv sync --extra test
```

Inside a source checkout, prefix the `melograph` commands below with `uv run`.

### Agent skill

The repository includes a model-invoked skill for agents that operate an already
installed `melograph` command. Install it separately from the CLI:

```bash
npx skills add beejsbj/melograph --skill melograph --global
```

The skill handles capture, artifact verification, re-rendering, and tracker
comparison. It never installs or upgrades the executable itself.

## Capture

One command accepts WAV or M4A:

```bash
melograph capture melody.m4a --out out/melody
```

Or record a fixed-length microphone take:

```bash
melograph capture mic --seconds 12 --out out/mic-take
```

Praat is used unless a tracker is selected explicitly. To try librosa's pYIN:

```bash
uv tool install --reinstall 'voice-to-strudel[pyin] @ git+https://github.com/beejsbj/melograph'
melograph capture melody.m4a --tracker pyin --out out/melody-pyin
```

Both trackers write the same artifact formats. `analysis.json` records the
actual implementation as `praat-ac` or `librosa-pyin`, so downstream tools can
identify how a take was interpreted.

The output directory contains:

- `original.<ext>`: an exact copy of file input; microphone captures begin with
  `source.wav` instead
- `source.wav`: the mono 22,050 Hz normalized analysis copy
- `contour.csv`: time, F0, MIDI, confidence, voicing, and energy per frame
- `events.csv`: phrase and note-event timing in tabular form
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
melograph render out/melody/analysis.json
```

## Benchmark

The optional fusion lane is deliberately a benchmark candidate, not the
default. It keeps a frame only when Praat and aubio agree within a cents gate.

```bash
uv tool install --reinstall 'voice-to-strudel[fusion] @ git+https://github.com/beejsbj/melograph'
melograph benchmark melody.wav --out out/benchmark.json
```

The report records wall time, peak RSS, voicing coverage, octave-error candidates,
contour disagreement, and the optional listening preference supplied with
`--preference`. It also writes `<report-stem>-audition/index.html` with source,
Praat, and fusion players for every take, plus a direct link to the generated
Praat `strudel.js` and a base64-encoded Strudel REPL launch link for each take.
Fusion should not become the product default unless listening justifies its
extra cost.

The named pilot fixture and current result are recorded in
[`docs/pilot-benchmark.md`](docs/pilot-benchmark.md).

## Limits

- Input must be monophonic; accompaniment and polyphony are out of scope.
- Note boundaries are candidates. Legato re-attacks without an energy dip may
  need a manual edit.
- Slides and vibrato remain in `contour.csv` and `contour-synth.wav`; the event
  summary records their pitch span, while ordinary Strudel notes necessarily
  reduce each gesture to one editable centre pitch.
- pYIN adds librosa and its scientific-Python dependencies, takes longer to load,
  and may make different voicing or octave decisions. Treat the tracker switch
  as an A/B listening aid, not a quality setting.
- Microphone capture depends on an `ffmpeg` input device (`pulse`/`alsa` on
  Linux, `avfoundation` on macOS). Use a recorded file if device discovery fails.

## Dependency licences

- Melograph (`voice-to-strudel` Python distribution): GPL-3.0-or-later
- NumPy: BSD-3-Clause
- Parselmouth: GPL-3.0-or-later (Praat itself is GPL-3.0-or-later)
- librosa, optional pYIN tracker: ISC
- aubio, optional fusion benchmark: GPL-3.0-or-later
- ffmpeg: build-dependent; the host binary may be LGPL or GPL
