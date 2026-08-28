from __future__ import annotations

import json
import resource
import statistics
import subprocess
import sys
import tempfile
import time
from html import escape
from pathlib import Path

import numpy as np

from .artifacts import synthesize_contour
from .audio import normalize_audio, read_wav, write_wav
from .pitch import agreement_fusion, track_aubio, track_praat
from .segment import AnalysisConfig, analyze_events


def benchmark_file(source: Path, output: Path, runs: int = 3) -> dict:
    audition_relative: str | None = None
    with tempfile.TemporaryDirectory(prefix="voice-to-strudel-") as temp:
        wav = Path(temp) / "source.wav"
        normalize_audio(source, wav)
        results = []
        for tracker in ("praat", "fusion"):
            command = [
                sys.executable, "-m", "voice_to_strudel.cli", "_bench-worker",
                str(wav), "--tracker", tracker, "--runs", str(runs),
            ]
            process = subprocess.run(command, capture_output=True, text=True, check=False)
            if process.returncode:
                results.append({"tracker": tracker, "error": process.stderr.strip() or process.stdout.strip()})
            else:
                results.append(json.loads(process.stdout))
        if not any(result.get("error") for result in results):
            audition_dir = output.parent / f"{output.stem}-audition"
            write_benchmark_audition(wav, audition_dir)
            audition_relative = f"{audition_dir.name}/index.html"
    report = {
        "schema_version": 1,
        "input": str(source),
        "modes": results,
        "audition_html": audition_relative,
        "human_preference": {"winner": None, "notes": None},
        "decision": "Fusion remains experimental until a listener records a preference that justifies its cost.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    return report


def write_benchmark_audition(wav: Path, output_dir: Path) -> None:
    audio = read_wav(wav)
    primary = track_praat(audio)
    secondary = track_aubio(audio, primary.times)
    fused = agreement_fusion(primary, secondary)
    primary_analysis, primary_frames = analyze_events(audio, primary, AnalysisConfig())
    _fusion_analysis, fusion_frames = analyze_events(audio, fused, AnalysisConfig())
    primary_audio = synthesize_contour(primary_frames["midi_processed"], primary.times, audio.duration, audio.sample_rate)
    fusion_audio = synthesize_contour(fusion_frames["midi_processed"], fused.times, audio.duration, audio.sample_rate)
    output_dir.mkdir(parents=True, exist_ok=True)
    cards: list[str] = []
    for phrase in primary_analysis["phrases"]:
        number = int(phrase["number"])
        start = max(0, round(float(phrase["start_seconds"]) * audio.sample_rate))
        end = min(len(audio.samples), round(float(phrase["end_seconds"]) * audio.sample_rate))
        names = {
            "Source": f"source-{number:02d}.wav",
            "Praat default": f"praat-{number:02d}.wav",
            "Agreement fusion": f"fusion-{number:02d}.wav",
        }
        write_wav(output_dir / names["Source"], audio.samples[start:end], audio.sample_rate)
        write_wav(output_dir / names["Praat default"], primary_audio[start:end], audio.sample_rate)
        write_wav(output_dir / names["Agreement fusion"], fusion_audio[start:end], audio.sample_rate)
        players = "".join(
            f'<label>{escape(label)}<audio controls preload="metadata" src="{escape(name)}"></audio></label>'
            for label, name in names.items()
        )
        cards.append(f"<section><h2>Take {number}</h2>{players}</section>")
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Voice to Strudel tracker audition</title><style>
body{{font:16px/1.5 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}}
section{{border:1px solid #444;border-radius:12px;padding:1rem;margin:1rem 0;background:#191919}}
label{{display:grid;grid-template-columns:10rem 1fr;align-items:center;margin:.7rem 0}} audio{{width:100%}}
</style></head><body><h1>Praat vs agreement fusion</h1>
<p>Listen to the source first. Record a winner and notes in the benchmark JSON; silence in fusion means the trackers disagreed.</p>
{''.join(cards)}</body></html>"""
    (output_dir / "index.html").write_text(page)


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
                "comparable_frames": len(cents),
            }
        else:
            raise ValueError(f"unknown tracker: {tracker_name}")
        analysis, frames = analyze_events(audio, selected, AnalysisConfig())
        return selected, analysis, frames, disagreement

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
    selected, analysis, frames, disagreement = final
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
        "octave_error_candidates_raw": octave_error_candidates(selected.midi),
        "octave_error_candidates_processed": octave_error_candidates(frames["midi_processed"]),
        "phrase_count": len(analysis["phrases"]),
        "contour_disagreement": disagreement,
    }


def octave_error_candidates(midi: np.ndarray) -> int:
    valid_pairs = np.isfinite(midi[:-1]) & np.isfinite(midi[1:])
    jumps = np.abs(np.diff(midi)[valid_pairs])
    if not len(jumps):
        return 0
    nearest_octaves = np.rint(jumps / 12.0)
    octave_like = (nearest_octaves >= 1) & (np.abs(jumps - 12.0 * nearest_octaves) <= 1.0)
    return int(np.sum(octave_like))
