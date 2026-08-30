from __future__ import annotations

from pathlib import Path

import numpy as np

from voice_to_strudel.audio import write_wav
from voice_to_strudel.benchmark import benchmark_file
from voice_to_strudel.pipeline import capture


def test_capture_writes_editable_and_audition_artifacts(tmp_path: Path) -> None:
    sample_rate = 22_050
    samples = np.zeros(sample_rate * 2, dtype=float)
    first_start, first_end = round(0.10 * sample_rate), round(0.55 * sample_rate)
    second_start, second_end = round(1.30 * sample_rate), round(1.70 * sample_rate)
    first = np.arange(first_end - first_start) / sample_rate
    second = np.arange(second_end - second_start) / sample_rate
    samples[first_start:first_end] = 0.35 * np.sin(2 * np.pi * 220 * first)
    samples[second_start:second_end] = 0.35 * np.sin(2 * np.pi * 247 * second)
    source = tmp_path / "input.wav"
    write_wav(source, samples, sample_rate)

    output = tmp_path / "output"
    analysis = capture(str(source), output)

    assert len(analysis["phrases"]) == 2
    assert analysis["source"]["original_sha256"]
    for relative in (
        "original.wav", "source.wav", "contour.csv", "events.csv", "analysis.json",
        "strudel.js", "synth.wav", "contour-synth.wav", "audition.html",
    ):
        assert (output / relative).is_file()


def test_capture_can_select_pyin(tmp_path: Path) -> None:
    sample_rate = 22_050
    times = np.arange(sample_rate) / sample_rate
    source = tmp_path / "input.wav"
    write_wav(source, 0.35 * np.sin(2 * np.pi * 220 * times), sample_rate)

    analysis = capture(str(source), tmp_path / "output", tracker="pyin")

    assert analysis["tracker"] == "librosa-pyin"
    assert analysis["phrases"]


def test_benchmark_writes_a_human_audition_surface(tmp_path: Path) -> None:
    sample_rate = 22_050
    times = np.arange(sample_rate) / sample_rate
    source = tmp_path / "tone.wav"
    write_wav(source, 0.3 * np.sin(2 * np.pi * 220 * times), sample_rate)
    report_path = tmp_path / "benchmark.json"
    report = benchmark_file(
        source,
        report_path,
        runs=1,
        human_preference="tie",
        preference_notes="Praat sounds as good as fusion.",
    )
    assert report["human_preference"] == {
        "winner": "tie",
        "notes": "Praat sounds as good as fusion.",
    }
    audition = tmp_path / "benchmark-audition"
    assert (audition / "index.html").is_file()
    assert (audition / "strudel.js").is_file()
    assert 'href="strudel.js"' in (audition / "index.html").read_text()
    assert "Open this take in Strudel" in (audition / "index.html").read_text()
    assert "https://strudel.cc/#" in (audition / "index.html").read_text()
    assert list(audition.glob("praat-*.wav"))
    assert list(audition.glob("fusion-*.wav"))
