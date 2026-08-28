from __future__ import annotations

from pathlib import Path

from .artifacts import preserve_original, sha256_file, write_capture
from .audio import capture_microphone, normalize_audio, read_wav
from .pitch import track_praat
from .segment import AnalysisConfig, analyze_events


def capture(
    input_value: str,
    output_dir: Path,
    *,
    seconds: float | None = None,
    config: AnalysisConfig | None = None,
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

    audio = read_wav(normalized)
    track = track_praat(audio)
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

