from __future__ import annotations

import json
import os
import resource
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

from .audio import normalize_audio, read_wav
from .pitch import agreement_fusion, track_aubio, track_praat
from .segment import AnalysisConfig, analyze_events


def benchmark_file(source: Path, output: Path, runs: int = 3) -> dict:
    with tempfile.TemporaryDirectory(prefix="voice-to-strudel-") as temp:
        wav = Path(temp) / "source.wav"
        normalize_audio(source, wav)
        results = []
        for tracker in ("praat", "fusion"):
            command = [
                sys.executable, "-m", "voice_to_strudel.cli", "_bench-worker",
                str(wav), "--tracker", tracker, "--runs", str(runs),
            ]
            process = subprocess.run(command, capture_output=True, text=True)
            if process.returncode:
                results.append({"tracker": tracker, "error": process.stderr.strip() or process.stdout.strip()})
            else:
                results.append(json.loads(process.stdout))
    report = {
        "schema_version": 1,
        "input": str(source),
        "modes": results,
        "human_preference": None,
        "decision": "Fusion remains experimental until a listener records a preference that justifies its cost.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    return report


def benchmark_worker(wav: Path, tracker_name: str, runs: int) -> dict:
    audio = read_wav(wav)

    def operation():
        primary = track_praat(audio)
        if tracker_name == "praat":
            selected = primary
            disagreement = None
        elif tracker_name == "fusion":
            secondary = track_aubio(audio, primary.times)
            selected = agreement_fusion(primary, secondary)
            both = primary.voiced & secondary.voiced & (primary.f0_hz > 0) & (secondary.f0_hz > 0)
            cents = np.abs(1200.0 * np.log2(primary.f0_hz[both] / secondary.f0_hz[both]))
            disagreement = {
                "median_cents": round(float(np.median(cents)), 3) if len(cents) else None,
                "frames_over_gate": int(np.sum(cents > 80.0)),
                "comparable_frames": int(len(cents)),
            }
        else:
            raise ValueError(f"unknown tracker: {tracker_name}")
        analysis, _frames = analyze_events(audio, selected, AnalysisConfig())
        return selected, analysis, disagreement

    operation()  # warm imports and native libraries
    walls: list[float] = []
    cpus: list[float] = []
    final = None
    for _ in range(runs):
        cpu_start = time.process_time()
        wall_start = time.perf_counter()
        final = operation()
        walls.append(time.perf_counter() - wall_start)
        cpus.append(time.process_time() - cpu_start)
    assert final is not None
    selected, analysis, disagreement = final
    midi = selected.midi
    voiced_midi = midi[np.isfinite(midi)]
    jumps = np.abs(np.diff(voiced_midi)) if len(voiced_midi) > 1 else np.array([])
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    peak_mib = rss / (1024 * 1024 if sys.platform == "darwin" else 1024)
    return {
        "tracker": tracker_name,
        "audio_seconds": round(audio.duration, 6),
        "warm_wall_seconds_median": round(statistics.median(walls), 6),
        "warm_wall_seconds_max": round(max(walls), 6),
        "warm_cpu_seconds_median": round(statistics.median(cpus), 6),
        "realtime_factor": round(statistics.median(walls) / audio.duration, 6),
        "peak_rss_mib": round(peak_mib, 3),
        "voicing_coverage": round(float(np.mean(selected.voiced)), 4),
        "octave_error_candidates": int(np.sum((jumps >= 11.0) & (jumps <= 13.0))),
        "phrase_count": len(analysis["phrases"]),
        "contour_disagreement": disagreement,
    }
