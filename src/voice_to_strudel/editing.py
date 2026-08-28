from __future__ import annotations

from copy import deepcopy


class EditError(ValueError):
    pass


def normalize_analysis(analysis: dict) -> dict:
    """Validate editable timing fields and recompute derived durations.

    Event and phrase start/end values are authoritative. Duration, confidence,
    attack, and gesture fields are derived diagnostics; changing them alone does
    not move an event.
    """
    result = deepcopy(analysis)
    source = result.get("source")
    if not isinstance(source, dict) or not source.get("normalized_file"):
        raise EditError("analysis.source.normalized_file is required")
    normalized_name = str(source["normalized_file"])
    if "/" in normalized_name or "\\" in normalized_name or normalized_name in {".", ".."}:
        raise EditError("analysis.source.normalized_file must be a file beside analysis.json")

    previous_phrase_end = -1.0
    for phrase_index, phrase in enumerate(result.get("phrases", []), start=1):
        start = _time(phrase, "start_seconds", f"phrase {phrase_index}")
        end = _time(phrase, "end_seconds", f"phrase {phrase_index}")
        if end <= start:
            raise EditError(f"phrase {phrase_index} must end after it starts")
        if start < previous_phrase_end:
            raise EditError(f"phrase {phrase_index} overlaps the previous phrase")
        previous_phrase_end = end
        phrase["number"] = phrase_index
        phrase["duration_seconds"] = round(end - start, 6)

        cursor = start
        for event_index, event in enumerate(phrase.get("events", []), start=1):
            label = f"phrase {phrase_index} event {event_index}"
            event_start = _time(event, "start_seconds", label)
            event_end = _time(event, "end_seconds", label)
            if event_end <= event_start:
                raise EditError(f"{label} must end after it starts")
            if event_start < start or event_end > end:
                raise EditError(f"{label} must stay inside its phrase boundaries")
            if event_start < cursor:
                raise EditError(f"{label} overlaps the previous event")
            if event.get("type") not in {"note", "rest"}:
                raise EditError(f"{label} type must be 'note' or 'rest'")
            if event["type"] == "note":
                try:
                    event["midi"] = float(event["midi"])
                except (KeyError, TypeError, ValueError) as error:
                    raise EditError(f"{label} requires a numeric midi value") from error
                if not 0 <= event["midi"] <= 127:
                    raise EditError(f"{label} midi must be between 0 and 127")
                event["pitch_hz"] = round(440.0 * 2.0 ** ((event["midi"] - 69.0) / 12.0), 4)
            event["duration_seconds"] = round(event_end - event_start, 6)
            cursor = event_end
    return result


def _time(container: dict, key: str, label: str) -> float:
    try:
        value = float(container[key])
    except (KeyError, TypeError, ValueError) as error:
        raise EditError(f"{label} requires numeric {key}") from error
    if value < 0:
        raise EditError(f"{label} {key} cannot be negative")
    container[key] = round(value, 6)
    return value
