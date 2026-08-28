from __future__ import annotations

from voice_to_strudel.editing import EditError, normalize_analysis
from voice_to_strudel.strudel import phrase_pattern, serialize_strudel


def phrase() -> dict:
    return {
        "number": 1,
        "start_seconds": 0.10,
        "end_seconds": 0.70,
        "duration_seconds": 0.60,
        "events": [
            {"type": "note", "start_seconds": 0.10, "end_seconds": 0.30, "midi": 60},
            {"type": "note", "start_seconds": 0.30, "end_seconds": 0.50, "midi": 60},
            {"type": "rest", "start_seconds": 0.50, "end_seconds": 0.60},
            {"type": "note", "start_seconds": 0.60, "end_seconds": 0.70, "midi": 63},
        ],
    }


def test_serialization_is_stable_and_keeps_repeated_attacks() -> None:
    expected = 'note("60@20 60@20 ~@10 63@10").slow(0.60)'
    assert phrase_pattern(phrase()) == expected
    analysis = {"phrases": [phrase()]}
    assert serialize_strudel(analysis) == serialize_strudel(analysis)
    assert expected in serialize_strudel(analysis)


def test_empty_capture_is_runnable_silence() -> None:
    assert serialize_strudel({"phrases": []}).endswith("silence\n")


def test_decimal_midi_is_serialized_without_truncation() -> None:
    value = phrase()
    value["events"][0]["midi"] = 60.75
    assert '60.75@20' in phrase_pattern(value)


def test_edit_normalization_recomputes_durations() -> None:
    analysis = {"source": {"normalized_file": "source.wav"}, "phrases": [phrase()]}
    analysis["phrases"][0]["events"][0]["duration_seconds"] = 99
    normalized = normalize_analysis(analysis)
    assert normalized["phrases"][0]["events"][0]["duration_seconds"] == 0.2


def test_phrase_edit_cannot_silently_compress_events() -> None:
    analysis = {"source": {"normalized_file": "source.wav"}, "phrases": [phrase()]}
    analysis["phrases"][0]["end_seconds"] = 0.65
    try:
        normalize_analysis(analysis)
    except EditError as error:
        assert "inside its phrase boundaries" in str(error)
    else:
        raise AssertionError("invalid phrase edit should have been rejected")
