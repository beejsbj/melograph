from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import ROUND_HALF_UP, Decimal
from itertools import pairwise

import numpy as np

from .model import Audio, PitchTrack, midi_to_hz


@dataclass(frozen=True, slots=True)
class AnalysisConfig:
    phrase_gap_seconds: float = 0.65
    fill_gap_seconds: float = 0.08
    minimum_note_seconds: float = 0.14
    pitch_change_cents: float = 100.0
    reattack_db: float = 4.5
    attack_refractory_seconds: float = 0.075


def round_half_up(value: float) -> int:
    return int(Decimal(str(value)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def median_smooth(values: np.ndarray, width: int = 7) -> np.ndarray:
    result = values.copy()
    radius = width // 2
    valid = np.isfinite(values)
    for index in np.flatnonzero(valid):
        start = max(0, index - radius)
        end = min(len(values), index + radius + 1)
        window = values[start:end]
        window = window[np.isfinite(window)]
        if len(window):
            result[index] = float(np.median(window))
    return result


def repair_short_gaps(midi: np.ndarray, times: np.ndarray, max_gap_seconds: float) -> tuple[np.ndarray, np.ndarray]:
    result = midi.copy()
    repaired = np.zeros(len(midi), dtype=bool)
    valid = np.isfinite(result)
    index = 0
    while index < len(result):
        if valid[index]:
            index += 1
            continue
        start = index
        while index < len(result) and not valid[index]:
            index += 1
        end = index
        if start == 0 or end == len(result):
            continue
        duration = times[end] - times[start - 1]
        if duration <= max_gap_seconds and abs(result[start - 1] - result[end]) <= 1.0:
            result[start:end] = np.linspace(result[start - 1], result[end], end - start + 2)[1:-1]
            repaired[start:end] = True
            valid[start:end] = True
    return result, repaired


def repair_octave_spikes(midi: np.ndarray, max_frames: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Repair only short, neighbour-bounded octave excursions.

    Sustained or attack-aligned octave changes remain untouched because the
    contour alone cannot prove that they are errors.
    """
    result = midi.copy()
    repaired = np.zeros(len(midi), dtype=bool)
    valid = np.isfinite(result)
    index = 1
    while index < len(result) - 1:
        if not valid[index]:
            index += 1
            continue
        left = index - 1
        if not valid[left]:
            index += 1
            continue
        delta = result[index] - result[left]
        shift = 12.0 * round(delta / 12.0)
        if abs(shift) < 11.0 or abs(delta - shift) > 1.0:
            index += 1
            continue
        end = index
        while end < len(result) and valid[end] and end - index < max_frames:
            if abs((result[end] - result[left]) - shift) > 1.0:
                break
            end += 1
        if end < len(result) and valid[end] and abs(result[end] - result[left]) <= 1.5:
            result[index:end] -= shift
            repaired[index:end] = True
            index = end
        else:
            index += 1
    return result, repaired


def spectral_flux(audio: Audio, times: np.ndarray, frame_size: int = 1_024) -> np.ndarray:
    window = np.hanning(frame_size)
    previous: np.ndarray | None = None
    flux = np.zeros(len(times), dtype=float)
    for index, time in enumerate(times):
        center = round(float(time) * audio.sample_rate)
        start = center - frame_size // 2
        chunk = np.zeros(frame_size, dtype=float)
        source_start = max(0, start)
        source_end = min(len(audio.samples), start + frame_size)
        if source_end > source_start:
            target_start = source_start - start
            chunk[target_start : target_start + source_end - source_start] = audio.samples[source_start:source_end]
        magnitude = np.abs(np.fft.rfft(chunk * window))
        total = float(np.sum(magnitude))
        if total:
            magnitude /= total
        if previous is not None:
            flux[index] = float(np.sum(np.maximum(magnitude - previous, 0.0)))
        previous = magnitude
    return flux


def robust_z(values: np.ndarray) -> np.ndarray:
    median = float(np.median(values))
    mad = float(np.median(np.abs(values - median)))
    if mad < 1e-12:
        deviation = float(np.std(values))
        return (values - median) / deviation if deviation >= 1e-12 else np.zeros(len(values), dtype=float)
    return (values - median) / (1.4826 * mad)


def phrase_spans(voiced: np.ndarray, times: np.ndarray, gap_seconds: float) -> list[tuple[int, int]]:
    positions = np.flatnonzero(voiced)
    if not len(positions):
        return []
    spans: list[tuple[int, int]] = []
    start = int(positions[0])
    previous = start
    for position_value in positions[1:]:
        position = int(position_value)
        if times[position] - times[previous] >= gap_seconds:
            spans.append((start, previous + 1))
            start = position
        previous = position
    spans.append((start, previous + 1))
    return spans


def _runs(values: np.ndarray) -> list[tuple[int, int, int]]:
    if not len(values):
        return []
    runs: list[tuple[int, int, int]] = []
    start = 0
    for index in range(1, len(values)):
        if values[index] != values[index - 1]:
            runs.append((start, index, int(values[index - 1])))
            start = index
    runs.append((start, len(values), int(values[-1])))
    return runs


def stable_pitch_boundaries(
    midi: np.ndarray,
    times: np.ndarray,
    minimum_seconds: float,
    change_cents: float = 75.0,
) -> list[int]:
    if not len(midi):
        return []
    minimum_frames = max(1, round(minimum_seconds / float(np.median(np.diff(times)))))
    if len(midi) < minimum_frames * 2:
        return []
    if is_continuous_slide(midi):
        return []
    quantized = np.asarray([round_half_up(float(value)) for value in midi], dtype=int)
    runs = _runs(quantized)
    while len(runs) > 1:
        short_index = next(
            (index for index, (start, end, _pitch) in enumerate(runs) if end - start < minimum_frames),
            None,
        )
        if short_index is None:
            break
        start, end, pitch = runs[short_index]
        neighbours: list[int] = []
        if short_index:
            neighbours.append(runs[short_index - 1][2])
        if short_index + 1 < len(runs):
            neighbours.append(runs[short_index + 1][2])
        if not neighbours:
            break
        quantized[start:end] = min(neighbours, key=lambda candidate: abs(candidate - pitch))
        runs = _runs(quantized)
    return [
        runs[index][0]
        for index in range(1, len(runs))
        if abs(runs[index][2] - runs[index - 1][2]) * 100.0 >= change_cents
    ]


def attack_candidates(
    rms_db: np.ndarray,
    flux: np.ndarray,
    start: int,
    end: int,
    times: np.ndarray,
    config: AnalysisConfig,
) -> list[tuple[int, float, str]]:
    if end - start < 3:
        return []
    local_flux_z = robust_z(flux[start:end])
    candidates: list[tuple[int, float, str]] = []
    lookahead = max(2, round(0.12 / float(np.median(np.diff(times)))))
    local_rms = rms_db[start:end]
    for local_index in range(lookahead, end - start - lookahead):
        index = start + local_index
        before_peak = float(np.max(local_rms[local_index - lookahead : local_index]))
        after = local_rms[local_index : local_index + lookahead + 1]
        valley = float(local_rms[local_index])
        after_peak = float(np.max(after))
        if before_peak - valley >= config.reattack_db * 0.6 and after_peak - valley >= config.reattack_db:
            recovery_offset = int(np.argmax(np.diff(after))) + 1
            recovery_index = index + recovery_offset
            score = (after_peak - valley) / config.reattack_db + max(0.0, local_flux_z[local_index])
            candidates.append((recovery_index, float(score), "energy-valley"))
        elif (
            local_flux_z[local_index] >= 4.0
            and local_flux_z[local_index] >= local_flux_z[local_index - 1]
            and local_flux_z[local_index] >= local_flux_z[local_index + 1]
        ):
            candidates.append((index, float(local_flux_z[local_index]), "spectral-flux"))
    refractory = max(config.attack_refractory_seconds, 0.12)
    kept: list[tuple[int, float, str]] = []
    for candidate in sorted(candidates, key=lambda item: item[1], reverse=True):
        if all(abs(times[candidate[0]] - times[other[0]]) >= refractory for other in kept):
            kept.append(candidate)
    return sorted(kept)


def is_continuous_slide(midi: np.ndarray) -> bool:
    if len(midi) < 6:
        return False
    smoothed = median_smooth(np.asarray(midi, dtype=float), 5)
    differences = np.diff(smoothed)
    moving = np.abs(differences) >= 0.01
    moving_indices = np.flatnonzero(moving)
    if len(moving_indices) < 4:
        return False
    groups: list[list[int]] = []
    for index_value in moving_indices:
        index = int(index_value)
        if groups and index - groups[-1][-1] <= 2:
            groups[-1].append(index)
        else:
            groups.append([index])
    substantial_groups = [group for group in groups if len(group) >= max(4, round(len(midi) * 0.08))]
    if len(substantial_groups) != 1:
        return False
    transition = substantial_groups[0]
    transition_differences = differences[transition]
    direction = np.sign(float(np.median(transition_differences)))
    if direction == 0:
        return False
    consistent = float(np.mean(np.sign(transition_differences) == direction))
    span = float(np.percentile(smoothed, 90) - np.percentile(smoothed, 10))
    return span >= 1.5 and consistent >= 0.85


def classify_gesture(midi: np.ndarray, times: np.ndarray) -> dict[str, float | str] | None:
    if len(midi) < 4:
        return None
    quarter = max(1, len(midi) // 4)
    start_pitch = float(np.median(midi[:quarter]))
    end_pitch = float(np.median(midi[-quarter:]))
    span_cents = float((np.percentile(midi, 90) - np.percentile(midi, 10)) * 100.0)
    delta_cents = (end_pitch - start_pitch) * 100.0
    if (
        abs(delta_cents) >= 150.0
        and span_cents >= 150.0
        and times[-1] - times[0] >= 0.12
        and is_continuous_slide(midi)
    ):
        return {"type": "slide", "delta_cents": round(delta_cents, 1), "span_cents": round(span_cents, 1)}
    if 60.0 <= span_cents <= 200.0 and times[-1] - times[0] >= 0.25:
        trend = np.linspace(start_pitch, end_pitch, len(midi))
        residual = midi - trend
        signs = np.sign(residual)
        signs = signs[signs != 0]
        sign_changes = int(np.sum(signs[1:] != signs[:-1])) if len(signs) > 1 else 0
        if sign_changes >= 4:
            return {"type": "vibrato_or_wobble", "span_cents": round(span_cents, 1)}
    return None


def analyze_events(audio: Audio, track: PitchTrack, config: AnalysisConfig) -> tuple[dict, dict[str, np.ndarray]]:
    raw_midi = track.midi
    gap_filled, gap_repairs = repair_short_gaps(raw_midi, track.times, config.fill_gap_seconds)
    octave_fixed, octave_repairs = repair_octave_spikes(gap_filled)
    processed = median_smooth(octave_fixed, 7)
    processed_voiced = np.isfinite(processed)
    flux = spectral_flux(audio, track.times)
    phrases: list[dict] = []

    for phrase_number, (phrase_start, phrase_end) in enumerate(
        phrase_spans(processed_voiced, track.times, config.phrase_gap_seconds), start=1
    ):
        events: list[dict] = []
        index = phrase_start
        while index < phrase_end:
            if not processed_voiced[index]:
                start = index
                while index < phrase_end and not processed_voiced[index]:
                    index += 1
                events.append(_rest_event(track.times, start, index, audio.duration))
                continue
            island_start = index
            while index < phrase_end and processed_voiced[index]:
                index += 1
            island_end = index
            minimum_frames = max(
                1,
                round(config.minimum_note_seconds / float(np.median(np.diff(track.times)))),
            )
            if island_end - island_start < minimum_frames:
                events.append(_rest_event(track.times, island_start, island_end, audio.duration))
                continue
            island_midi = processed[island_start:island_end]
            island_times = track.times[island_start:island_end]
            pitch_cuts = [island_start + offset for offset in stable_pitch_boundaries(
                island_midi, island_times, config.minimum_note_seconds, config.pitch_change_cents
            )]
            attacks = attack_candidates(track.rms_db, flux, island_start, island_end, track.times, config)
            attacks = [
                candidate for candidate in attacks
                if all(abs(track.times[candidate[0]] - track.times[cut]) >= config.minimum_note_seconds for cut in pitch_cuts)
            ]
            ordered = _compact_cuts(
                island_start,
                island_end,
                pitch_cuts,
                attacks,
                minimum_frames,
            )
            attack_by_index = {candidate[0]: candidate for candidate in attacks}
            for start, end in pairwise(ordered):
                if end <= start:
                    continue
                event_midi = processed[start:end]
                event_times = track.times[start:end]
                raw = raw_midi[start:end]
                raw = raw[np.isfinite(raw)]
                midi_value = round_half_up(float(np.median(event_midi)))
                end_seconds = _frame_end(track.times, end, audio.duration)
                event: dict = {
                    "type": "note",
                    "start_seconds": round(float(track.times[start]), 6),
                    "end_seconds": round(end_seconds, 6),
                    "duration_seconds": round(end_seconds - float(track.times[start]), 6),
                    "midi": midi_value,
                    "pitch_hz": round(float(midi_to_hz(midi_value)), 4),
                    "raw_midi_median": round(float(np.median(raw)) if len(raw) else float(np.median(event_midi)), 4),
                    "confidence": round(float(np.median(track.confidence[start:end])), 4),
                    "voiced_coverage": round(float(np.mean(track.voiced[start:end])), 4),
                    "attack": (
                        {"source": attack_by_index[start][2], "score": round(attack_by_index[start][1], 3)}
                        if start in attack_by_index else
                        {"source": "phrase_or_pitch_boundary", "score": 1.0}
                    ),
                    "gesture": classify_gesture(event_midi, event_times),
                    "flags": [],
                }
                if np.any(gap_repairs[start:end]):
                    event["flags"].append("short_gap_repaired")
                if np.any(octave_repairs[start:end]):
                    event["flags"].append("octave_spike_repaired")
                events.append(event)

        events = _merge_adjacent_rests(events)
        phrase_start_seconds = float(track.times[phrase_start])
        phrase_end_seconds = _frame_end(track.times, phrase_end, audio.duration)
        phrases.append({
            "number": phrase_number,
            "start_seconds": round(phrase_start_seconds, 6),
            "end_seconds": round(phrase_end_seconds, 6),
            "duration_seconds": round(phrase_end_seconds - phrase_start_seconds, 6),
            "events": events,
        })

    result = {
        "config": asdict(config),
        "phrases": phrases,
        "warnings": [
            "Phrase boundaries and attacks are candidates; listen before accepting them.",
            "Slides and vibrato are preserved in the contour but numeric Strudel notes quantize their centre pitch.",
        ],
    }
    frame_data = {
        "midi_raw": raw_midi,
        "midi_processed": processed,
        "gap_repaired": gap_repairs,
        "octave_repaired": octave_repairs,
        "spectral_flux": flux,
    }
    return result, frame_data


def _frame_end(times: np.ndarray, end_index: int, duration: float) -> float:
    if end_index < len(times):
        return min(float(times[end_index]), duration)
    if len(times) > 1:
        return min(float(times[-1] + np.median(np.diff(times))), duration)
    return duration


def _rest_event(times: np.ndarray, start: int, end: int, duration: float) -> dict:
    start_seconds = float(times[start])
    end_seconds = _frame_end(times, end, duration)
    return {
        "type": "rest",
        "start_seconds": round(start_seconds, 6),
        "end_seconds": round(end_seconds, 6),
        "duration_seconds": round(end_seconds - start_seconds, 6),
    }


def _merge_adjacent_rests(events: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for event in events:
        if event["type"] == "rest" and merged and merged[-1]["type"] == "rest":
            merged[-1]["end_seconds"] = event["end_seconds"]
            merged[-1]["duration_seconds"] = round(
                float(event["end_seconds"]) - float(merged[-1]["start_seconds"]), 6
            )
        else:
            merged.append(event)
    return merged


def _compact_cuts(
    start: int,
    end: int,
    pitch_cuts: list[int],
    attacks: list[tuple[int, float, str]],
    minimum_frames: int,
) -> list[int]:
    attack_scores = {candidate[0]: candidate[1] for candidate in attacks}
    candidates = sorted(set(pitch_cuts) | set(attack_scores))
    candidates = [
        candidate for candidate in candidates
        if candidate - start >= minimum_frames and end - candidate >= minimum_frames
    ]
    groups: list[list[int]] = []
    for candidate in candidates:
        if groups and candidate - groups[-1][-1] < minimum_frames:
            groups[-1].append(candidate)
        else:
            groups.append([candidate])
    chosen: list[int] = []
    cursor = start
    for group in groups:
        attacks_in_group = [candidate for candidate in group if candidate in attack_scores]
        candidate = (
            max(attacks_in_group, key=attack_scores.__getitem__)
            if attacks_in_group else group[len(group) // 2]
        )
        if candidate - cursor >= minimum_frames and end - candidate >= minimum_frames:
            chosen.append(candidate)
            cursor = candidate
    return [start, *chosen, end]
