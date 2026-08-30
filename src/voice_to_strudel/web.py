from __future__ import annotations

import math

from .audio import read_wav_bytes
from .model import midi_to_note_name
from .pitch import track_pitch
from .segment import AnalysisConfig, analyze_events
from .strudel import phrase_pattern, serialize_strudel, strudel_repl_url

MAX_WEB_AUDIO_SECONDS = 45.0


def analyze_wav_payload(payload: bytes, *, tracker: str = "praat") -> dict:
    audio = read_wav_bytes(payload)
    if audio.duration <= 0:
        raise ValueError("the recording is empty")
    if audio.duration > MAX_WEB_AUDIO_SECONDS:
        raise ValueError(f"recordings are limited to {MAX_WEB_AUDIO_SECONDS:.0f} seconds")

    track = track_pitch(audio, tracker=tracker)
    analysis, frames = analyze_events(audio, track, AnalysisConfig())
    phrases = analysis["phrases"]
    for phrase in phrases:
        for event in phrase["events"]:
            if event["type"] == "note":
                event["note"] = midi_to_note_name(float(event["midi"]))

    return {
        "schema_version": 1,
        "product": "Melograph",
        "tracker": track.tracker,
        "duration_seconds": round(audio.duration, 6),
        "frames": [
            {
                "time_seconds": round(float(track.times[index]), 6),
                "f0_hz_raw": _finite(track.f0_hz[index], 4),
                "midi_raw": _finite(frames["midi_raw"][index], 4),
                "midi_processed": _finite(frames["midi_processed"][index], 4),
                "confidence": round(float(track.confidence[index]), 4),
                "voiced": bool(track.voiced[index]),
                "rms_db": round(float(track.rms_db[index]), 3),
            }
            for index in range(len(track.times))
        ],
        "phrases": phrases,
        "strudel": serialize_strudel(analysis),
        "takes": [
            {
                "number": int(phrase["number"]),
                "code": f"setcpm(60)\n{phrase_pattern(phrase)}\n",
                "repl_url": strudel_repl_url(phrase),
            }
            for phrase in phrases
        ],
        "warnings": analysis["warnings"],
    }


def _finite(value: float, decimals: int) -> float | None:
    number = float(value)
    return round(number, decimals) if math.isfinite(number) else None
