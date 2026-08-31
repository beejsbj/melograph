from __future__ import annotations

import base64
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal
from urllib.parse import quote

from .model import midi_to_note_name

TICKS_PER_SECOND = 100
DEFAULT_CPS = Decimal("0.5")
PitchFormat = Literal["notes", "midi"]


def to_tick(seconds: float) -> int:
    return int((Decimal(str(seconds)) * TICKS_PER_SECOND).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def phrase_pattern(phrase: dict, *, pitch_format: PitchFormat = "notes") -> str:
    start_tick = to_tick(phrase["start_seconds"])
    end_tick = to_tick(phrase["end_seconds"])
    tokens: list[str] = []
    cursor = start_tick
    for event in phrase["events"]:
        event_start = max(cursor, to_tick(event["start_seconds"]))
        event_end = max(event_start + 1, to_tick(event["end_seconds"]))
        if event_start > cursor:
            tokens.append(_weighted("~", event_start - cursor))
        token = "~" if event["type"] == "rest" else format_pitch(float(event["midi"]), pitch_format)
        tokens.append(_weighted(token, event_end - event_start))
        cursor = event_end
    if cursor < end_tick:
        tokens.append(_weighted("~", end_tick - cursor))
    rows = [" ".join(tokens[index:index + 4]) for index in range(0, len(tokens), 4)]
    body = "\n".join(rows)
    return f'`<\n{body}\n>`\n  .as("note")\n  .sound("triangle")'


def serialize_strudel(analysis: dict, *, pitch_format: PitchFormat = "notes") -> str:
    phrases = playable_phrases(analysis.get("phrases", []))
    lines: list[str] = []
    if len(phrases) == 1:
        lines.append(phrase_pattern(phrases[0], pitch_format=pitch_format))
    elif len(phrases) > 1:
        for phrase in phrases:
            name = f"TAKE_{int(phrase['number'])}"
            lines.extend([f"${name}: {phrase_pattern(phrase, pitch_format=pitch_format)}", ""])
        lines.pop()
    else:
        lines.append("silence")
    return "\n".join(lines) + "\n"


def strudel_repl_url(phrase: dict, *, pitch_format: PitchFormat = "notes") -> str:
    code = f"{phrase_pattern(phrase, pitch_format=pitch_format)}\n"
    encoded = base64.b64encode(code.encode()).decode()
    return f"https://strudel.cc/#{quote(encoded, safe='')}"


def _weighted(token: str, weight: int) -> str:
    cycles = Decimal(weight) / TICKS_PER_SECOND * DEFAULT_CPS
    formatted = format(cycles.normalize(), "f")
    return token if cycles == 1 else f"{token}@{formatted}"


def format_pitch(value: float, pitch_format: PitchFormat) -> str:
    if pitch_format == "notes":
        return midi_to_note_name(value)
    if pitch_format == "midi":
        return format_midi(value)
    raise ValueError(f"unsupported pitch format: {pitch_format}")


def playable_phrases(phrases: list[dict]) -> list[dict]:
    return [
        phrase for phrase in phrases
        if any(event.get("type") == "note" and event.get("midi") is not None for event in phrase.get("events", []))
    ]


def format_midi(value: float) -> str:
    rounded = round(value, 3)
    if rounded.is_integer():
        return str(int(rounded))
    return f"{rounded:.3f}".rstrip("0").rstrip(".")
