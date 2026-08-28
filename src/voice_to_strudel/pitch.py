from __future__ import annotations

import numpy as np

from .model import Audio, PitchTrack

HOP_SECONDS = 256 / 22_050


def frame_rms_db(audio: Audio, times: np.ndarray, frame_seconds: float = 0.046) -> np.ndarray:
    radius = max(1, round(frame_seconds * audio.sample_rate / 2))
    result = np.empty(len(times), dtype=float)
    for index, time in enumerate(times):
        center = round(float(time) * audio.sample_rate)
        start = max(0, center - radius)
        end = min(len(audio.samples), center + radius)
        window = audio.samples[start:end]
        rms = float(np.sqrt(np.mean(window * window))) if len(window) else 0.0
        result[index] = 20.0 * np.log10(max(rms, 1e-8))
    return result


def track_praat(
    audio: Audio,
    *,
    floor_hz: float = 65.0,
    ceiling_hz: float = 1_050.0,
    hop_seconds: float = HOP_SECONDS,
    energy_gate_db: float = -24.0,
) -> PitchTrack:
    try:
        import parselmouth
    except ImportError as error:  # pragma: no cover - installation failure
        raise RuntimeError("praat-parselmouth is required for pitch tracking") from error

    sound = parselmouth.Sound(np.asarray(audio.samples, dtype=np.float64), audio.sample_rate)
    pitch = sound.to_pitch_ac(
        time_step=hop_seconds,
        pitch_floor=floor_hz,
        pitch_ceiling=ceiling_hz,
    )
    times = np.asarray(pitch.xs(), dtype=float)
    f0 = np.asarray(pitch.selected_array["frequency"], dtype=float)
    confidence = np.asarray(pitch.selected_array["strength"], dtype=float)
    rms_db = frame_rms_db(audio, times)
    relative_energy = rms_db - float(np.max(rms_db))
    voiced = (f0 >= floor_hz) & (f0 <= ceiling_hz) & (relative_energy >= energy_gate_db)
    return PitchTrack(times, f0, confidence, voiced, rms_db, "praat-ac")


def track_aubio(
    audio: Audio,
    times: np.ndarray,
    *,
    floor_hz: float = 65.0,
    ceiling_hz: float = 1_050.0,
    frame_size: int = 2_048,
    hop_size: int = 256,
) -> PitchTrack:
    try:
        import aubio
    except ImportError as error:
        raise RuntimeError("aubio is required for the optional fusion benchmark") from error

    pitcher = aubio.pitch("yinfft", frame_size, hop_size, audio.sample_rate)
    pitcher.set_unit("Hz")
    pitcher.set_silence(-40)
    padded = np.pad(
        np.asarray(audio.samples, dtype=aubio.float_type),
        (0, (-len(audio.samples)) % hop_size),
    )
    values: list[float] = []
    confidence: list[float] = []
    for offset in range(0, len(padded), hop_size):
        values.append(float(pitcher(padded[offset : offset + hop_size])[0]))
        confidence.append(float(pitcher.get_confidence()))
    source_times = np.arange(len(values), dtype=float) * hop_size / audio.sample_rate
    values_array = np.asarray(values)
    confidence_array = np.asarray(confidence)
    f0 = np.interp(times, source_times, values_array, left=0.0, right=0.0)
    conf = np.interp(times, source_times, confidence_array, left=0.0, right=0.0)
    rms_db = frame_rms_db(audio, times)
    relative_energy = rms_db - float(np.max(rms_db))
    voiced = (f0 >= floor_hz) & (f0 <= ceiling_hz) & (relative_energy >= -24.0)
    conf = np.where(voiced & (conf <= 0), 1.0, conf)
    return PitchTrack(times, f0, conf, voiced, rms_db, "aubio-yinfft")


def agreement_fusion(primary: PitchTrack, secondary: PitchTrack, gate_cents: float = 80.0) -> PitchTrack:
    if not np.array_equal(primary.times, secondary.times):
        raise ValueError("fusion tracks must share a time grid")
    both = primary.voiced & secondary.voiced & (primary.f0_hz > 0) & (secondary.f0_hz > 0)
    distance = np.full(len(primary.times), np.nan, dtype=float)
    distance[both] = np.abs(1200.0 * np.log2(primary.f0_hz[both] / secondary.f0_hz[both]))
    agreed = both & (distance <= gate_cents)
    f0 = np.zeros(len(primary.times), dtype=float)
    f0[agreed] = np.sqrt(primary.f0_hz[agreed] * secondary.f0_hz[agreed])
    confidence = np.zeros(len(primary.times), dtype=float)
    confidence[agreed] = np.minimum(primary.confidence[agreed], secondary.confidence[agreed])
    return PitchTrack(
        primary.times.copy(), f0, confidence, agreed, primary.rms_db.copy(),
        f"agreement({primary.tracker},{secondary.tracker})",
    )
