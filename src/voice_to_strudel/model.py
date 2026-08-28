from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(slots=True)
class Audio:
    samples: np.ndarray
    sample_rate: int

    @property
    def duration(self) -> float:
        return len(self.samples) / self.sample_rate


@dataclass(slots=True)
class PitchTrack:
    times: np.ndarray
    f0_hz: np.ndarray
    confidence: np.ndarray
    voiced: np.ndarray
    rms_db: np.ndarray
    tracker: str

    @property
    def midi(self) -> np.ndarray:
        result = np.full(self.f0_hz.shape, np.nan, dtype=float)
        valid = self.voiced & np.isfinite(self.f0_hz) & (self.f0_hz > 0)
        result[valid] = 69.0 + 12.0 * np.log2(self.f0_hz[valid] / 440.0)
        return result


def hz_to_midi(frequency: float) -> float:
    return 69.0 + 12.0 * np.log2(frequency / 440.0)


def midi_to_hz(midi: float) -> float:
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)

