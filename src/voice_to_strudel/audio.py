from __future__ import annotations

import io
import platform
import shutil
import subprocess
import tempfile
import wave
from collections.abc import Callable
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
    destination.parent.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    for input_args in microphone_input_options():
        command = _microphone_command(ffmpeg, input_args, seconds, sample_rate, str(destination))
        try:
            _run(command, "microphone capture")
            return
        except AudioError as error:
            failures.append(str(error))
    raise AudioError("microphone capture failed through every available backend: " + " | ".join(failures))


def capture_microphone_stream(
    destination: Path,
    seconds: float,
    on_samples: Callable[[np.ndarray], None],
    sample_rate: int = SAMPLE_RATE,
    chunk_samples: int = 512,
) -> None:
    """Capture PCM once, writing the canonical WAV while exposing causal chunks."""
    if seconds <= 0:
        raise AudioError("--seconds must be greater than zero")
    ffmpeg = require_ffmpeg()
    destination.parent.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    for input_args in microphone_input_options():
        destination.unlink(missing_ok=True)
        command = _microphone_command(ffmpeg, input_args, seconds, sample_rate, "pipe:1", raw=True)
        process: subprocess.Popen[bytes] | None = None
        exposed_audio = False
        with tempfile.TemporaryFile() as stderr:
            try:
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=stderr)
                if process.stdout is None:  # pragma: no cover - subprocess contract
                    raise AudioError("microphone capture did not expose an audio pipe")
                with wave.open(str(destination), "wb") as handle:
                    handle.setnchannels(1)
                    handle.setsampwidth(2)
                    handle.setframerate(sample_rate)
                    carry = b""
                    while payload := process.stdout.read(chunk_samples * 2):
                        payload = carry + payload
                        usable = len(payload) - (len(payload) % 2)
                        pcm, carry = payload[:usable], payload[usable:]
                        if not pcm:
                            continue
                        handle.writeframesraw(pcm)
                        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float64) / 32768.0
                        exposed_audio = True
                        on_samples(samples)
                return_code = process.wait()
                if return_code:
                    stderr.seek(0)
                    detail = stderr.read().decode(errors="replace").strip() or f"exit {return_code}"
                    raise AudioError(f"microphone capture failed: {detail}")
                return
            except (OSError, AudioError) as error:
                failures.append(str(error))
                if process is not None and process.poll() is None:
                    process.kill()
                    process.wait()
                if exposed_audio:
                    raise AudioError(str(error)) from error
    destination.unlink(missing_ok=True)
    raise AudioError("microphone capture failed through every available backend: " + " | ".join(failures))


def microphone_input_options(system: str | None = None) -> list[list[str]]:
    resolved = system or platform.system()
    if resolved == "Darwin":
        return [["-f", "avfoundation", "-i", ":0"]]
    if resolved == "Linux":
        return [
            ["-f", "pulse", "-i", "default"],
            ["-f", "alsa", "-i", "default"],
        ]
    raise AudioError(f"microphone capture is not configured for {resolved}; pass a WAV or M4A")


def _microphone_command(
    ffmpeg: str,
    input_args: list[str],
    seconds: float,
    sample_rate: int,
    destination: str,
    *,
    raw: bool = False,
) -> list[str]:
    command = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *input_args,
        "-t", f"{seconds:.3f}", "-ac", "1", "-ar", str(sample_rate),
        "-c:a", "pcm_s16le",
    ]
    if raw:
        command.extend(["-f", "s16le"])
    return [*command, destination]


def read_wav(path: Path) -> Audio:
    with wave.open(str(path), "rb") as handle:
        return _read_wav_handle(handle)


def read_wav_bytes(payload: bytes) -> Audio:
    try:
        with wave.open(io.BytesIO(payload), "rb") as handle:
            return _read_wav_handle(handle)
    except (EOFError, wave.Error) as error:
        raise AudioError(f"invalid WAV payload: {error}") from error


def _read_wav_handle(handle: wave.Wave_read) -> Audio:
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
