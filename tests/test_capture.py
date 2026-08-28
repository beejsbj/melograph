from __future__ import annotations

from pathlib import Path

import numpy as np

from voice_to_strudel.audio import write_wav
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
