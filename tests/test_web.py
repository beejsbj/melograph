from __future__ import annotations

import base64
import io
import wave
from urllib.parse import unquote

import numpy as np

from voice_to_strudel.web import analyze_wav_payload


def tone_payload() -> bytes:
    sample_rate = 22_050
    time = np.arange(sample_rate) / sample_rate
    samples = 0.35 * np.sin(2 * np.pi * 220 * time)
    pcm = np.rint(samples * 32767).astype("<i2")
    payload = io.BytesIO()
    with wave.open(payload, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return payload.getvalue()


def test_web_analysis_returns_contour_names_and_runnable_take() -> None:

    result = analyze_wav_payload(tone_payload())

    assert result["product"] == "Melograph"
    assert result["tracker"] == "praat-ac"
    assert result["frames"]
    assert result["phrases"][0]["events"][0]["note"] == "A3"
    assert result["takes"][0]["code"].startswith("`<\n")
    assert "A3@" in result["takes"][0]["code"]
    assert '.as("note")' in result["takes"][0]["code"]
    assert "57@" in result["takes"][0]["code_midi"]
    encoded = unquote(result["takes"][0]["repl_url"].split("#", 1)[1])
    assert base64.b64decode(encoded).decode() == result["takes"][0]["code"]


def test_web_analysis_can_select_pyin() -> None:
    result = analyze_wav_payload(tone_payload(), tracker="pyin")

    assert result["tracker"] == "librosa-pyin"
    assert result["frames"]
    assert result["phrases"]
