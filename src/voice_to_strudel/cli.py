from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .artifacts import render_edited
from .benchmark import benchmark_file, benchmark_worker
from .pipeline import capture
from .segment import AnalysisConfig


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="voice-to-strudel")
    commands = root.add_subparsers(dest="command", required=True)

    capture_parser = commands.add_parser("capture", help="analyze WAV/M4A or record a microphone")
    capture_parser.add_argument("input", help="audio path or the literal 'mic'")
    capture_parser.add_argument("--out", type=Path, required=True, help="artifact directory")
    capture_parser.add_argument("--seconds", type=float, help="microphone recording duration")
    capture_parser.add_argument("--phrase-gap", type=float, default=0.65, help="seconds of silence between phrases")

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
            analysis = capture(
                arguments.input,
                arguments.out,
                seconds=arguments.seconds,
                config=AnalysisConfig(phrase_gap_seconds=arguments.phrase_gap),
            )
            print(f"wrote {arguments.out} ({len(analysis['phrases'])} phrases)")
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


if __name__ == "__main__":
    raise SystemExit(main())
