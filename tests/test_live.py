from __future__ import annotations

import io
from itertools import pairwise
from pathlib import Path

import numpy as np
import pytest

from voice_to_strudel import audio
from voice_to_strudel.live import AubioLiveTracker, LivePitchFrame


def test_incremental_aubio_tracks_sine_then_silence() -> None:
    sample_rate = 22_050
    tone_time = np.arange(round(sample_rate * 0.6)) / sample_rate
    samples = np.concatenate((
        0.35 * np.sin(2 * np.pi * 220 * tone_time),
        np.zeros(round(sample_rate * 0.25)),
    ))
    tracker = AubioLiveTracker(sample_rate)

    frames = []
    for offset in range(0, len(samples), 137):
        frames.extend(tracker.push(samples[offset : offset + 137]))

    voiced = [frame for frame in frames if frame.voiced]
    assert voiced
    assert any(frame.note == "A3" for frame in voiced)
    assert any(not frame.voiced for frame in frames[-8:])
    assert set(voiced[-1].as_dict()) == {
        "timestamp_seconds", "frequency_hz", "midi", "clarity", "voiced", "note",
    }
    assert all(
        left.timestamp_seconds < right.timestamp_seconds
        for left, right in pairwise(frames)
    )


def test_stream_capture_writes_wav_and_exposes_same_pcm(monkeypatch, tmp_path: Path) -> None:
    pcm = np.asarray([0, 8192, -8192, 16384], dtype="<i2").tobytes()

    class FakeProcess:
        def __init__(self) -> None:
            self.stdout = io.BytesIO(pcm)
            self.returncode = 0

        def wait(self) -> int:
            return 0

        def poll(self) -> int:
            return 0

    received = []
    monkeypatch.setattr(audio, "require_ffmpeg", lambda: "ffmpeg")
    monkeypatch.setattr(audio, "microphone_input_options", lambda: [["-f", "fake", "-i", "mic"]])
    stderr_sinks = []

    def fake_popen(*args, **kwargs):
        stderr_sinks.append(kwargs["stderr"])
        return FakeProcess()

    monkeypatch.setattr(audio.subprocess, "Popen", fake_popen)

    destination = tmp_path / "source.wav"
    audio.capture_microphone_stream(destination, 1.0, received.append, chunk_samples=2)

    captured = audio.read_wav(destination)
    exposed = np.concatenate(received)
    assert np.allclose(captured.samples, exposed)
    assert np.allclose(exposed, np.asarray([0, 0.25, -0.25, 0.5]))
    assert stderr_sinks[0] is not audio.subprocess.PIPE


def test_stream_capture_reports_stderr_from_nonblocking_file(monkeypatch, tmp_path: Path) -> None:
    diagnostic = b"device unavailable\n" * 10_000

    class FakeProcess:
        def __init__(self, stderr) -> None:
            self.stdout = io.BytesIO()
            stderr.write(diagnostic)

        def wait(self) -> int:
            return 1

        def poll(self) -> int:
            return 1

    monkeypatch.setattr(audio, "require_ffmpeg", lambda: "ffmpeg")
    monkeypatch.setattr(audio, "microphone_input_options", lambda: [["-f", "fake", "-i", "mic"]])
    monkeypatch.setattr(
        audio.subprocess,
        "Popen",
        lambda *args, **kwargs: FakeProcess(kwargs["stderr"]),
    )

    with pytest.raises(audio.AudioError, match="device unavailable"):
        audio.capture_microphone_stream(tmp_path / "source.wav", 1.0, lambda _: None)


def test_live_frame_contract_keeps_unvoiced_values_null() -> None:
    frame = LivePitchFrame(0.1, None, None, 0.0, False, None)
    assert frame.as_dict() == {
        "timestamp_seconds": 0.1,
        "frequency_hz": None,
        "midi": None,
        "clarity": 0.0,
        "voiced": False,
        "note": None,
    }
