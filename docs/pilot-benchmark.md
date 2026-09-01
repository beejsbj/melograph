# Pilot benchmark

Fixture: the 31.68-second, seven-take BJS-183 hum recording, decoded to mono
22,050 Hz PCM WAV. The source audio is deliberately not committed; use an
authorized local copy as `user-hum.wav`. Host: bjslab, Intel i7-6700HQ.

From a source checkout, prepare the optional fusion dependency, then run the
benchmark and the separate Praat capture that supplies the browser comparison:

```bash
uv sync --extra fusion
uv run melograph benchmark user-hum.wav --out out/benchmark.json --runs 7
uv run melograph capture user-hum.wav --out out/capture
```

Measured 2026-08-28 after one warm-up run. The timing includes Praat tracking,
energy/voicing analysis, contour repair, spectral-flux calculation, attack and
phrase segmentation, and event inference. It excludes CLI process startup,
FFmpeg decode, and artifact writes.

| Mode | Warm wall median | CPU median | Peak RSS | Voicing | Octave-error candidates | Phrases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Praat default | 0.689 s | 0.861 s | 120.0 MiB | 56.18% | 0 raw / 0 repaired | 7 |
| Praat + aubio agreement gate | 0.888 s | 1.022 s | 121.1 MiB | 42.13% | 0 raw / 0 repaired | 7 |

Where both trackers were voiced, their median disagreement was 30.4 cents;
320 of 1,468 comparable frames exceeded the 80-cent agreement gate.
The command also writes `out/benchmark-audition/index.html`, with source, Praat,
and agreement-fusion players for each of the seven takes, plus a direct link to
the Praat-derived `strudel.js`.

## Verdict

Praat remains the product default. On 2026-08-28, Burooj judged Praat to sound as
good as fusion. Fusion costs about 29% more wall time and drops roughly a quarter
of the default's voiced frames, so the audible tie gives no reason to pay that
cost. Fusion remains an optional benchmark extra rather than a capture mode.

The default reproduced seven separate phrases and reported no octave-error
candidates. It does not combine or vote across the seven takes.

## Provisional live lane

The BJS-183 pilot also measured standalone aubio YINFFT on the 31.68-second
fixture at 0.214 seconds wall time and 41 MiB peak RSS. Its contour was noisier
than Praat, but the lower cost makes it useful as a causal display while audio is
still arriving. It is therefore a provisional live tracker, not another final
interpretation: CLI capture shows its frames immediately, then runs Praat over
the completed `source.wav` for every durable artifact.

The browser lane was run over that same decoded fixture with the production
`LiveMpmTracker` (Pitchy MPM, 2,048-sample causal frames) on 2026-09-01. The
reproducible harness emits its frame CSV, a Pitchy contour synth, and a three-way
source/Praat/Pitchy audition page:

```bash
npm --prefix web ci
cd web
node scripts/pilot-live-pitch.mjs \
  ../user-hum.wav \
  ../out/capture/contour.csv \
  ../out/capture/contour-synth.wav \
  ../out/pitchy-pilot
```

Pitchy voiced 188 of 341 frames (55.13%) and retained the fixture's seven phrase
groups at the product's 650 ms phrase-gap threshold. All 188 voiced frames had a
nearby voiced Praat reference: median absolute disagreement was 5.8 cents, three
frames exceeded 80 cents, and none exceeded 600 cents. Listening through the
generated source → Praat → Pitchy
surface preserved the seven sung ideas and their melody without an audible
octave jump; Pitchy's 92.9 ms causal blocks make entrances and releases coarser
than the final Praat synth. This is acceptable for a temporary visual guide, not
as a replacement for final analysis. A live microphone acceptance run the same
day was also reported as working correctly.
