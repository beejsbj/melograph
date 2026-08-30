---
name: melograph
description: "Turn monophonic recordings into pitch contours, editable notes, audition artifacts, and Strudel; re-render edited analyses or compare trackers with the Melograph CLI."
license: GPL-3.0-or-later
---

# Melograph

Use the `melograph` executable on `PATH` as the canonical interface. If it is absent, stop and point to the repository's [installation instructions](https://github.com/beejsbj/melograph#install) so installation remains an explicit user action.

Keep source audio and generated artifacts local unless the user explicitly asks to move or publish them.

## Capture

1. Resolve the input file and choose a new output directory. Use microphone capture only when the user explicitly requests it.
2. Confirm readiness:

   ```bash
   command -v melograph
   command -v ffmpeg
   melograph capture --help
   ```

3. Capture with the default tracker:

   ```bash
   melograph capture "/path/to/melody.m4a" --out "/path/to/output"
   ```

   For an explicitly requested microphone capture:

   ```bash
   melograph capture mic --seconds 12 --out "/path/to/output"
   ```

   Praat is the default. Use `--tracker pyin` only when the user asks for pYIN or a second interpretation; write it to a separate output directory.

4. Require exit status `0`, then require these artifacts:

   ```text
   analysis.json
   contour.csv
   events.csv
   source.wav
   contour-synth.wav
   synth.wav
   strudel.js
   audition.html
   ```

5. Parse `analysis.json`. Report the recorded tracker, phrase count, note-event count, warnings, and paths to `audition.html` and `strudel.js`. Present note names as interpretations; preserve the contour as the evidence when they disagree.

## Edit and render

Use this branch only when the user asks to change an existing analysis. Edit event `type`, `midi`, `start_seconds`, or `end_seconds` in `analysis.json`, then rebuild derived artifacts:

```bash
melograph render "/path/to/output/analysis.json"
```

Require exit status `0`, valid JSON, and refreshed `events.csv`, `synth.wav`, `strudel.js`, and `audition.html`. Return the changed event interpretation and the audition path for human listening.

## Compare

For a Praat-versus-pYIN comparison, capture the same source into two distinct directories and compare their audition surfaces. pYIN may be unavailable in a base installation; surface that capability error rather than changing the installation.

The `benchmark` command is a separate Praat-versus-fusion diagnostic. Use it only when the user explicitly asks for that benchmark:

```bash
melograph benchmark "/path/to/melody.wav" --out "/path/to/benchmark.json"
```

## Completion

A run is complete only when the command succeeds, every expected artifact exists, `analysis.json` parses, warnings are reported, and the user receives the local audition and Strudel paths.
