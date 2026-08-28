from __future__ import annotations

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

