from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np

from .artifacts import preserve_original, sha256_file, write_capture
from .audio import (
    SAMPLE_RATE,
    capture_microphone,
    capture_microphone_stream,
    normalize_audio,
    read_wav,
)
from .live import AubioLiveTracker, LivePitchFrame
from .pitch import track_pitch
from .segment import AnalysisConfig, analyze_events


def capture(
    input_value: str,
    output_dir: Path,
    *,
    seconds: float | None = None,
    config: AnalysisConfig | None = None,
    tracker: str = "praat",
) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    normalized = output_dir / "source.wav"
    if input_value == "mic":
        if seconds is None:
            raise ValueError("microphone capture requires --seconds")
        capture_microphone(normalized, seconds)
        original = normalized
        input_kind = "microphone"
    else:
        source = Path(input_value).expanduser().resolve()
        original = preserve_original(source, output_dir)
        normalize_audio(source, normalized)
        input_kind = "file"

    return _finalize_capture(normalized, original, input_kind, output_dir, config, tracker)


def capture_live_microphone(
    output_dir: Path,
    *,
    seconds: float,
    on_frame: Callable[[LivePitchFrame], None],
    config: AnalysisConfig | None = None,
) -> dict:
    """Stream provisional aubio frames, then finalize the same WAV with Praat."""
    output_dir.mkdir(parents=True, exist_ok=True)
    normalized = output_dir / "source.wav"
    live_tracker = AubioLiveTracker(SAMPLE_RATE)

    def observe(samples: np.ndarray) -> None:
        for frame in live_tracker.push(samples):
            on_frame(frame)

    capture_microphone_stream(normalized, seconds, observe)
    return _finalize_capture(
        normalized, normalized, "microphone", output_dir, config, tracker="praat"
    )


def _finalize_capture(
    normalized: Path,
    original: Path,
    input_kind: str,
    output_dir: Path,
    config: AnalysisConfig | None,
    tracker: str,
) -> dict:
    audio = read_wav(normalized)
    track = track_pitch(audio, tracker=tracker)
    event_analysis, frame_data = analyze_events(audio, track, config or AnalysisConfig())
    analysis = {
        "schema_version": 1,
        "source": {
            "input_kind": input_kind,
            "original_file": original.name,
            "original_sha256": sha256_file(original),
            "normalized_file": normalized.name,
            "normalized_sha256": sha256_file(normalized),
            "sample_rate": audio.sample_rate,
            "duration_seconds": round(audio.duration, 6),
        },
        "tracker": track.tracker,
        **event_analysis,
    }
    write_capture(output_dir, analysis, track, frame_data)
    return analysis
