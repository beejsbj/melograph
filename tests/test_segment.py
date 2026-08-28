from __future__ import annotations

import numpy as np

from voice_to_strudel.model import Audio, PitchTrack
from voice_to_strudel.pitch import agreement_fusion, frame_rms_db
from voice_to_strudel.segment import (
    AnalysisConfig,
    _compact_cuts,
    analyze_events,
    attack_candidates,
    classify_gesture,
    phrase_spans,
    repair_octave_spikes,
    spectral_flux,
    stable_pitch_boundaries,
)


def test_repairs_only_short_bounded_octave_spike() -> None:
    contour = np.array([60.0, 60.1, 72.0, 72.1, 60.0, 60.1])
    repaired, flags = repair_octave_spikes(contour, max_frames=3)
    assert np.allclose(repaired, [60.0, 60.1, 60.0, 60.1, 60.0, 60.1], atol=0.11)
    assert flags.tolist() == [False, False, True, True, False, False]


def test_preserves_sustained_octave_change() -> None:
    contour = np.array([60.0, 60.1, 72.0, 72.1, 72.0, 72.1, 72.0])
    repaired, flags = repair_octave_spikes(contour, max_frames=3)
    assert np.array_equal(repaired, contour)
    assert not flags.any()


def test_phrase_spans_split_long_silence_but_keep_short_rest() -> None:
    times = np.arange(12) * 0.1
    voiced = np.array([0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1], dtype=bool)
    assert phrase_spans(voiced, times, 0.5) == [(1, 7), (11, 12)]
    assert phrase_spans(np.zeros(12, dtype=bool), times, 0.5) == []


def test_repeated_pitch_attack_remains_a_boundary() -> None:
    times = np.arange(40) * 0.01
    rms = np.full(40, -18.0)
    rms[18:21] = [-30.0, -28.0, -18.0]
    flux = np.zeros(40)
    flux[20] = 1.0
    attacks = attack_candidates(rms, flux, 0, 40, times, AnalysisConfig(reattack_db=4.0))
    assert attacks and attacks[0][0] == 20
    assert _compact_cuts(0, 40, [], attacks, minimum_frames=8) == [0, 20, 40]


def test_slide_and_vibrato_are_gestures_not_note_chatter() -> None:
    times = np.linspace(0.0, 0.5, 51)
    slide = classify_gesture(np.linspace(60.0, 64.0, 51), times)
    vibrato = classify_gesture(60.0 + 0.45 * np.sin(2 * np.pi * 6 * times), times)
    assert slide and slide["type"] == "slide"
    assert vibrato and vibrato["type"] == "vibrato_or_wobble"


def test_stepwise_ascent_is_not_collapsed_into_a_slide() -> None:
    times = np.arange(45) * 0.01
    staircase = np.repeat([60.0, 62.0, 64.0], 15)
    assert classify_gesture(staircase, times) is None
    assert stable_pitch_boundaries(staircase, times, 0.10) == [15, 30]


def test_real_amplitude_valley_produces_one_reattack() -> None:
    sample_rate = 10_000
    sample_times = np.arange(sample_rate) / sample_rate
    envelope = np.full(sample_rate, 0.4)
    envelope[4_200:5_000] = 0.02
    audio = Audio(envelope * np.sin(2 * np.pi * 220 * sample_times), sample_rate)
    times = np.arange(0.05, 0.95, 0.01)
    rms = frame_rms_db(audio, times)
    flux = spectral_flux(audio, times)
    attacks = attack_candidates(rms, flux, 0, len(times), times, AnalysisConfig(reattack_db=4.0))
    assert len(attacks) == 1
    assert 0.47 <= times[attacks[0][0]] <= 0.54


def test_silence_produces_no_phrases() -> None:
    times = np.arange(30) * 0.01
    track = PitchTrack(
        times=times,
        f0_hz=np.zeros(30),
        confidence=np.zeros(30),
        voiced=np.zeros(30, dtype=bool),
        rms_db=np.full(30, -160.0),
        tracker="test",
    )
    analysis, _frames = analyze_events(Audio(np.zeros(3_000), 10_000), track, AnalysisConfig())
    assert analysis["phrases"] == []


def test_fusion_keeps_only_agreeing_frames_in_log_frequency_space() -> None:
    times = np.array([0.0, 0.01, 0.02])
    primary = PitchTrack(times, np.array([220.0, 220.0, 220.0]), np.ones(3), np.ones(3, bool), np.zeros(3), "a")
    secondary = PitchTrack(times, np.array([221.0, 440.0, 218.0]), np.ones(3), np.ones(3, bool), np.zeros(3), "b")
    fused = agreement_fusion(primary, secondary, gate_cents=80.0)
    assert fused.voiced.tolist() == [True, False, True]
    assert fused.f0_hz[1] == 0.0
    assert np.isclose(fused.f0_hz[0], np.sqrt(220.0 * 221.0))
