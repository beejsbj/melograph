from __future__ import annotations

import platform
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np

from .model import Audio

SAMPLE_RATE = 22_050


class AudioError(RuntimeError):
    pass


def require_ffmpeg() -> str:
    executable = shutil.which("ffmpeg")
    if not executable:
        raise AudioError("ffmpeg is required to decode files and capture a microphone")
    return executable


def normalize_audio(source: Path, destination: Path, sample_rate: int = SAMPLE_RATE) -> None:
    if not source.is_file():
        raise AudioError(f"input does not exist: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [
        require_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-map_metadata", "-1", "-ac", "1", "-ar", str(sample_rate),
        "-c:a", "pcm_s16le", str(destination),
    ]
    _run(command, "audio decode")


def capture_microphone(destination: Path, seconds: float, sample_rate: int = SAMPLE_RATE) -> None:
    if seconds <= 0:
        raise AudioError("--seconds must be greater than zero")
    ffmpeg = require_ffmpeg()
    system = platform.system()
    if system == "Darwin":
        input_options = [["-f", "avfoundation", "-i", ":0"]]
    elif system == "Linux":
        input_options = [
            ["-f", "pulse", "-i", "default"],
            ["-f", "alsa", "-i", "default"],
        ]
    else:
        raise AudioError(f"microphone capture is not configured for {system}; pass a WAV or M4A")
    destination.parent.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    for input_args in input_options:
        command = [
            ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *input_args,
            "-t", f"{seconds:.3f}", "-ac", "1", "-ar", str(sample_rate),
            "-c:a", "pcm_s16le", str(destination),
        ]
        try:
            _run(command, "microphone capture")
            return
        except AudioError as error:
            failures.append(str(error))
    raise AudioError("microphone capture failed through every available backend: " + " | ".join(failures))


def read_wav(path: Path) -> Audio:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        sample_rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
    if channels != 1 or width != 2:
        raise AudioError(f"expected mono 16-bit PCM WAV, got {channels} channels and {width * 8}-bit")
    samples = np.frombuffer(frames, dtype="<i2").astype(np.float64) / 32768.0
    return Audio(samples=samples, sample_rate=sample_rate)


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(np.asarray(samples, dtype=float), -1.0, 1.0)
    pcm = np.rint(clipped * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def _run(command: list[str], purpose: str) -> None:
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() or error.stdout.strip() or f"exit {error.returncode}"
        raise AudioError(f"{purpose} failed: {detail}") from error
