from __future__ import annotations

import csv
import hashlib
import html
import json
import shutil
from pathlib import Path

import numpy as np

from .audio import read_wav, write_wav
from .editing import normalize_analysis
from .model import PitchTrack, midi_to_hz
from .strudel import serialize_strudel


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def preserve_original(source: Path, output_dir: Path) -> Path:
    suffix = source.suffix.lower() or ".audio"
    destination = output_dir / f"original{suffix}"
    if source.resolve() != destination.resolve():
        shutil.copy2(source, destination)
    return destination


def write_capture(
    output_dir: Path,
    analysis: dict,
    track: PitchTrack,
    frame_data: dict[str, np.ndarray],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    write_contour_csv(output_dir / "contour.csv", track, frame_data)
    contour_audio = synthesize_contour(
        frame_data["midi_processed"], track.times, analysis["source"]["duration_seconds"],
        analysis["source"]["sample_rate"],
    )
    write_wav(output_dir / "contour-synth.wav", contour_audio, analysis["source"]["sample_rate"])
    (output_dir / "analysis.json").write_text(json.dumps(analysis, indent=2) + "\n")
    render_edited(output_dir / "analysis.json")


def write_contour_csv(path: Path, track: PitchTrack, frame_data: dict[str, np.ndarray]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "time_seconds", "f0_hz_raw", "midi_raw", "midi_processed", "praat_strength",
            "voiced_raw", "rms_db", "spectral_flux", "gap_repaired", "octave_repaired",
        ])
        for index, time in enumerate(track.times):
            writer.writerow([
                f"{time:.6f}",
                _number(track.f0_hz[index], 5, zero_blank=True),
                _number(frame_data["midi_raw"][index], 5),
                _number(frame_data["midi_processed"][index], 5),
                f"{track.confidence[index]:.5f}",
                int(track.voiced[index]),
                f"{track.rms_db[index]:.4f}",
                f"{frame_data['spectral_flux'][index]:.7f}",
                int(frame_data["gap_repaired"][index]),
                int(frame_data["octave_repaired"][index]),
            ])


def render_edited(analysis_path: Path) -> None:
    analysis = normalize_analysis(json.loads(analysis_path.read_text()))
    analysis_path.write_text(json.dumps(analysis, indent=2) + "\n")
    output_dir = analysis_path.parent
    source_path = output_dir / analysis["source"]["normalized_file"]
    audio = read_wav(source_path)
    candidate = synthesize_events(analysis, len(audio.samples), audio.sample_rate)
    contour_path = output_dir / "contour-synth.wav"
    contour = read_wav(contour_path).samples if contour_path.is_file() else None
    write_wav(output_dir / "synth.wav", candidate, audio.sample_rate)
    write_events_csv(output_dir / "events.csv", analysis)
    (output_dir / "strudel.js").write_text(serialize_strudel(analysis))
    write_audition(output_dir, analysis, audio.samples, candidate, contour, audio.sample_rate)


def synthesize_events(analysis: dict, sample_count: int, sample_rate: int) -> np.ndarray:
    samples = np.zeros(sample_count, dtype=float)
    phase = 0.0
    fade = max(1, round(0.008 * sample_rate))
    for phrase in analysis.get("phrases", []):
        for event in phrase.get("events", []):
            if event.get("type") != "note":
                continue
            start = max(0, round(float(event["start_seconds"]) * sample_rate))
            end = min(sample_count, round(float(event["end_seconds"]) * sample_rate))
            if end <= start:
                continue
            frequency = midi_to_hz(float(event["midi"]))
            count = end - start
            phases = phase + 2.0 * np.pi * frequency * np.arange(count) / sample_rate
            tone = 0.28 * np.sin(phases)
            edge = min(fade, count // 2)
            if edge:
                ramp = np.linspace(0.0, 1.0, edge, endpoint=False)
                tone[:edge] *= ramp
                tone[-edge:] *= ramp[::-1]
            samples[start:end] += tone
            phase = float(phases[-1] + 2.0 * np.pi * frequency / sample_rate)
    return np.clip(samples, -1.0, 1.0)


def synthesize_contour(midi: np.ndarray, times: np.ndarray, duration: float, sample_rate: int) -> np.ndarray:
    sample_count = round(duration * sample_rate)
    samples = np.zeros(sample_count, dtype=float)
    if len(times) < 2:
        return samples
    hop = max(1, round(float(np.median(np.diff(times))) * sample_rate))
    phase = 0.0
    for index, pitch in enumerate(midi):
        start = round(float(times[index]) * sample_rate)
        end = min(sample_count, start + hop)
        if end <= start or not np.isfinite(pitch):
            continue
        frequency = midi_to_hz(float(pitch))
        phases = phase + 2.0 * np.pi * frequency * np.arange(end - start) / sample_rate
        samples[start:end] = 0.28 * np.sin(phases)
        phase = float(phases[-1] + 2.0 * np.pi * frequency / sample_rate)
    return samples


def write_events_csv(path: Path, analysis: dict) -> None:
    fields = [
        "phrase", "event", "type", "start_seconds", "end_seconds", "duration_seconds",
        "midi", "confidence", "voiced_coverage", "gesture", "flags",
    ]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for phrase in analysis.get("phrases", []):
            for event_number, event in enumerate(phrase.get("events", []), start=1):
                writer.writerow({
                    "phrase": phrase["number"],
                    "event": event_number,
                    "type": event["type"],
                    "start_seconds": event["start_seconds"],
                    "end_seconds": event["end_seconds"],
                    "duration_seconds": event["duration_seconds"],
                    "midi": event.get("midi", ""),
                    "confidence": event.get("confidence", ""),
                    "voiced_coverage": event.get("voiced_coverage", ""),
                    "gesture": json.dumps(event.get("gesture"), separators=(",", ":")) if event.get("gesture") else "",
                    "flags": ";".join(event.get("flags", [])),
                })


def write_audition(
    output_dir: Path,
    analysis: dict,
    source: np.ndarray,
    candidate: np.ndarray,
    contour: np.ndarray | None,
    sample_rate: int,
) -> None:
    audition_dir = output_dir / "audition"
    audition_dir.mkdir(exist_ok=True)
    cards: list[str] = []
    for phrase in analysis.get("phrases", []):
        number = int(phrase["number"])
        start = max(0, round(float(phrase["start_seconds"]) * sample_rate))
        end = min(len(source), round(float(phrase["end_seconds"]) * sample_rate))
        source_name = f"source-{number:02d}.wav"
        synth_name = f"synth-{number:02d}.wav"
        contour_name = f"contour-{number:02d}.wav"
        write_wav(audition_dir / source_name, source[start:end], sample_rate)
        write_wav(audition_dir / synth_name, candidate[start:end], sample_rate)
        if contour is not None:
            write_wav(audition_dir / contour_name, contour[start:end], sample_rate)
        note_list = " ".join(str(event["midi"]) for event in phrase["events"] if event["type"] == "note")
        cards.append(f"""
        <section>
          <h2>Take {number}</h2>
          <p><code>{html.escape(note_list)}</code> · {float(phrase['duration_seconds']):.2f}s</p>
          <label>Source<audio controls preload="metadata" src="audition/{source_name}"></audio></label>
          {f'<label>Tracked contour<audio controls preload="metadata" src="audition/{contour_name}"></audio></label>' if contour is not None else ''}
          <label>Candidate<audio controls preload="metadata" src="audition/{synth_name}"></audio></label>
        </section>""")
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Voice to Strudel audition</title>
<style>
body{{font:16px/1.5 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}}
section{{border:1px solid #444;border-radius:12px;padding:1rem;margin:1rem 0;background:#191919}}
label{{display:grid;grid-template-columns:6rem 1fr;align-items:center;margin:.7rem 0}} audio{{width:100%}}
code{{color:#b8f7ce}} a{{color:#9cc9ff}}
</style></head><body>
<h1>Voice to Strudel A/B</h1>
<p>Listen before accepting. Edit <a href="analysis.json">analysis.json</a>, then run <code>melograph render analysis.json</code>.</p>
{''.join(cards) if cards else '<p>No voiced phrases detected.</p>'}
</body></html>"""
    (output_dir / "audition.html").write_text(page)


def _number(value: float, decimals: int, *, zero_blank: bool = False) -> str:
    if not np.isfinite(value) or (zero_blank and value <= 0):
        return ""
    return f"{value:.{decimals}f}"
