# Pilot benchmark

Fixture: the 31.68-second, seven-take BJS-183 hum recording, decoded to mono
22,050 Hz PCM WAV. Host: bjslab, Intel i7-6700HQ. Command:

```bash
uv run voice-to-strudel benchmark user-hum.wav --out out/benchmark.json --runs 7
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
