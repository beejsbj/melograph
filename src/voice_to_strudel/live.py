from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .model import hz_to_midi, midi_to_note_name


@dataclass(frozen=True, slots=True)
class LivePitchFrame:
    """Causal, provisional pitch observation shared semantically with the web UI."""

    timestamp_seconds: float
    frequency_hz: float | None
    midi: float | None
    clarity: float
    voiced: bool
    note: str | None

    def as_dict(self) -> dict:
        return asdict(self)


class AubioLiveTracker:
    """Incremental aubio YINFFT tracker; final artifacts still use Praat."""

    def __init__(
        self,
        sample_rate: int,
        *,
        floor_hz: float = 65.0,
        ceiling_hz: float = 1_050.0,
        frame_size: int = 2_048,
        hop_size: int = 512,
        silence_db: float = -40.0,
    ) -> None:
        try:
            import aubio
        except ImportError as error:
            raise RuntimeError(
                "live microphone tracking requires the optional 'live' dependency; "
                "install with `uv tool install --reinstall "
                "'voice-to-strudel[live] @ git+https://github.com/beejsbj/melograph'`"
            ) from error

        self._aubio = aubio
        self._pitcher = aubio.pitch("yinfft", frame_size, hop_size, sample_rate)
        self._pitcher.set_unit("Hz")
        self._pitcher.set_silence(silence_db)
        self._sample_rate = sample_rate
        self._floor_hz = floor_hz
        self._ceiling_hz = ceiling_hz
        self._hop_size = hop_size
        self._pending = np.empty(0, dtype=np.float64)
        self._processed_samples = 0

    def push(self, samples: np.ndarray) -> list[LivePitchFrame]:
        incoming = np.asarray(samples, dtype=np.float64)
        if not len(incoming):
            return []
        pending = np.concatenate((self._pending, incoming))
        frames: list[LivePitchFrame] = []
        offset = 0
        while len(pending) - offset >= self._hop_size:
            block = np.asarray(
                pending[offset : offset + self._hop_size], dtype=self._aubio.float_type
            )
            frequency = float(self._pitcher(block)[0])
            clarity = float(np.clip(self._pitcher.get_confidence(), 0.0, 1.0))
            self._processed_samples += self._hop_size
            voiced = self._floor_hz <= frequency <= self._ceiling_hz
            midi = float(hz_to_midi(frequency)) if voiced else None
            frames.append(LivePitchFrame(
                timestamp_seconds=round(self._processed_samples / self._sample_rate, 6),
                frequency_hz=round(frequency, 4) if voiced else None,
                midi=round(midi, 4) if midi is not None else None,
                clarity=round(clarity, 4),
                voiced=voiced,
                note=midi_to_note_name(midi) if midi is not None else None,
            ))
            offset += self._hop_size
        self._pending = pending[offset:].copy()
        return frames
