from __future__ import annotations

import base64
from urllib.parse import unquote

from voice_to_strudel.editing import EditError, normalize_analysis
from voice_to_strudel.strudel import phrase_pattern, serialize_strudel, strudel_repl_url


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
    expected = '`<\nC4@0.1 C4@0.1 ~@0.05 D#4@0.05\n>`\n  .as("note")\n  .sound("triangle")'
    assert phrase_pattern(phrase()) == expected
    analysis = {"phrases": [phrase()]}
    assert serialize_strudel(analysis) == serialize_strudel(analysis)
    assert expected in serialize_strudel(analysis)


def test_empty_capture_is_runnable_silence() -> None:
    assert serialize_strudel({"phrases": []}).endswith("silence\n")


def test_full_output_names_only_multiple_playable_takes() -> None:
    second = phrase()
    second["number"] = 2
    empty = {**phrase(), "number": 3, "events": []}

    single = serialize_strudel({"phrases": [phrase(), empty]})
    full = serialize_strudel({"phrases": [phrase(), second, empty]})

    assert "$TAKE_" not in single
    assert "$TAKE_1:" in full
    assert "$TAKE_2:" in full
    assert "$TAKE_3:" not in full


def test_repl_url_embeds_one_runnable_take_as_base64() -> None:
    url = strudel_repl_url(phrase())
    encoded = unquote(url.removeprefix("https://strudel.cc/#"))
    code = base64.b64decode(encoded).decode()
    assert code == '`<\nC4@0.1 C4@0.1 ~@0.05 D#4@0.05\n>`\n  .as("note")\n  .sound("triangle")\n'


def test_note_names_are_default_and_midi_precision_is_optional() -> None:
    value = phrase()
    value["events"][0]["midi"] = 60.75
    assert "C#4@0.1" in phrase_pattern(value)
    assert "60.75@0.1" in phrase_pattern(value, pitch_format="midi")


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
