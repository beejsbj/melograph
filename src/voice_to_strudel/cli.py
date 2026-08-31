from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from pathlib import Path

from .artifacts import render_edited
from .benchmark import benchmark_file, benchmark_worker
from .live import LivePitchFrame
from .pipeline import capture, capture_live_microphone
from .pitch import TRACKERS
from .segment import AnalysisConfig


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="melograph")
    commands = root.add_subparsers(dest="command", required=True)

    capture_parser = commands.add_parser("capture", help="analyze WAV/M4A or record a microphone")
    capture_parser.add_argument("input", help="audio path or the literal 'mic'")
    capture_parser.add_argument("--out", type=Path, required=True, help="artifact directory")
    capture_parser.add_argument("--seconds", type=float, help="microphone recording duration")
    capture_parser.add_argument(
        "--live",
        action="store_true",
        help="show provisional aubio YINFFT pitch while recording; microphone only",
    )
    capture_parser.add_argument(
        "--live-output",
        choices=("human", "jsonl"),
        default="human",
        help="live frame output format (default: human)",
    )
    capture_parser.add_argument("--phrase-gap", type=float, default=0.65, help="seconds of silence between phrases")
    capture_parser.add_argument(
        "--tracker",
        choices=TRACKERS,
        default="praat",
        help="pitch tracker (default: praat; pyin requires the optional pyin dependency)",
    )

    render_parser = commands.add_parser("render", help="rebuild outputs from an edited analysis.json")
    render_parser.add_argument("analysis", type=Path)

    benchmark_parser = commands.add_parser("benchmark", help="compare default and agreement-gated fusion")
    benchmark_parser.add_argument("input", type=Path)
    benchmark_parser.add_argument("--out", type=Path, required=True)
    benchmark_parser.add_argument("--runs", type=int, default=3)
    benchmark_parser.add_argument("--preference", choices=("praat", "fusion", "tie"))
    benchmark_parser.add_argument("--preference-notes")

    worker = commands.add_parser("_bench-worker", help=argparse.SUPPRESS)
    worker.add_argument("wav", type=Path)
    worker.add_argument("--tracker", choices=("praat", "fusion"), required=True)
    worker.add_argument("--runs", type=int, default=3)
    return root


def main(argv: list[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    try:
        if arguments.command == "capture":
            config = AnalysisConfig(phrase_gap_seconds=arguments.phrase_gap)
            if arguments.live:
                if arguments.input != "mic":
                    raise ValueError("--live is only available with `melograph capture mic`")
                if arguments.seconds is None:
                    raise ValueError("live microphone capture requires --seconds")
                if arguments.tracker != "praat":
                    raise ValueError("--live finalizes with Praat; remove the alternate --tracker")
                live_sink = _live_frame_sink(arguments.live_output)
                analysis = capture_live_microphone(
                    arguments.out,
                    seconds=arguments.seconds,
                    config=config,
                    on_frame=live_sink,
                )
            else:
                analysis = capture(
                    arguments.input,
                    arguments.out,
                    seconds=arguments.seconds,
                    config=config,
                    tracker=arguments.tracker,
                )
            final_tracker = analysis.get("tracker", arguments.tracker)
            summary = f"wrote {arguments.out} ({len(analysis['phrases'])} phrases; {final_tracker})"
            print(summary, file=sys.stderr if arguments.live and arguments.live_output == "jsonl" else sys.stdout)
        elif arguments.command == "render":
            render_edited(arguments.analysis.resolve())
            print(f"rendered {arguments.analysis.parent}")
        elif arguments.command == "benchmark":
            report = benchmark_file(
                arguments.input.resolve(),
                arguments.out.resolve(),
                arguments.runs,
                human_preference=arguments.preference,
                preference_notes=arguments.preference_notes,
            )
            print(json.dumps(report, indent=2))
        elif arguments.command == "_bench-worker":
            print(json.dumps(benchmark_worker(arguments.wav, arguments.tracker, arguments.runs)))
        return 0
    except (OSError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


def _live_frame_sink(output_format: str) -> Callable[[LivePitchFrame], None]:
    last_human_time = float("-inf")
    last_note: str | None = None

    def emit(frame: LivePitchFrame) -> None:
        nonlocal last_human_time, last_note
        if output_format == "jsonl":
            _print_live_frame(frame, output_format)
            return
        note_changed = frame.note != last_note
        if not note_changed and frame.timestamp_seconds - last_human_time < 0.125:
            return
        _print_live_frame(frame, output_format)
        last_human_time = frame.timestamp_seconds
        last_note = frame.note

    return emit


def _print_live_frame(frame: LivePitchFrame, output_format: str) -> None:
    if output_format == "jsonl":
        print(json.dumps(frame.as_dict(), separators=(",", ":")), flush=True)
        return
    if frame.voiced:
        print(
            f"{frame.timestamp_seconds:7.3f}s  {frame.note or '—':<4}  "
            f"{frame.frequency_hz or 0:7.2f} Hz  clarity {frame.clarity:.2f}",
            flush=True,
        )
    else:
        print(f"{frame.timestamp_seconds:7.3f}s  —     unvoiced      clarity {frame.clarity:.2f}", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
