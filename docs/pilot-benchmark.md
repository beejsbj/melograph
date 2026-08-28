# Pilot benchmark

Fixture: the 31.68-second, seven-take BJS-183 hum recording, decoded to mono
22,050 Hz PCM WAV. Host: bjslab, Intel i7-6700HQ. Command:

```bash
uv run voice-to-strudel benchmark user-hum.wav --out out/benchmark.json --runs 3
```

Measured 2026-08-28 after one warm-up run. The timing includes Praat tracking,
energy/voicing analysis, contour repair, spectral-flux calculation, attack and
phrase segmentation, and event inference. It excludes CLI process startup,
FFmpeg decode, and artifact writes.

| Mode | Warm wall median | CPU median | Peak RSS | Voicing | Octave-error candidates | Phrases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Praat default | 0.590 s | 0.757 s | 120.9 MiB | 56.18% | 0 | 7 |
| Praat + aubio agreement gate | 0.783 s | 0.948 s | 121.2 MiB | 42.13% | 0 | 7 |

Where both trackers were voiced, their median disagreement was 30.4 cents;
320 of 1,468 comparable frames exceeded the 80-cent agreement gate.

## Verdict

Praat remains the product default. Fusion costs about 33% more wall time and
drops roughly a quarter of the default's voiced frames. No human preference has
yet been recorded for the fused result, so it remains an optional benchmark
extra rather than a capture mode. That is the honest boundary: the measurements
can reject a cost-free-fusion story, but only listening can decide whether the
remaining contour is musically better.

The default reproduced seven separate phrases and reported no octave-error
candidates. It does not combine or vote across the seven takes.

