from __future__ import annotations

from pathlib import Path

from voice_to_strudel import cli
from voice_to_strudel.live import LivePitchFrame


def test_canonical_command_name_is_melograph() -> None:
    assert cli.parser().prog == "melograph"


def test_capture_tracker_option_reaches_pipeline(monkeypatch, tmp_path: Path) -> None:
    received = {}

    def fake_capture(input_value, output_dir, **options):
        received.update(input_value=input_value, output_dir=output_dir, **options)
        return {"phrases": []}

    monkeypatch.setattr(cli, "capture", fake_capture)

    result = cli.main([
        "capture", "melody.wav", "--out", str(tmp_path / "output"),
        "--tracker", "pyin",
    ])

    assert result == 0
    assert received["tracker"] == "pyin"


def test_capture_tracker_defaults_to_praat(monkeypatch, tmp_path: Path) -> None:
    received = {}

    def fake_capture(input_value, output_dir, **options):
        received.update(input_value=input_value, output_dir=output_dir, **options)
        return {"phrases": []}

    monkeypatch.setattr(cli, "capture", fake_capture)

    result = cli.main(["capture", "melody.wav", "--out", str(tmp_path / "output")])

    assert result == 0
    assert received["tracker"] == "praat"


def test_live_capture_streams_jsonl_then_finalizes_with_praat(monkeypatch, tmp_path: Path, capsys) -> None:
    received = {}

    def fake_live_capture(output_dir, **options):
        received.update(output_dir=output_dir, **options)
        options["on_frame"](LivePitchFrame(0.25, 220.0, 57.0, 0.91, True, "A3"))
        return {"phrases": [{}], "tracker": "praat-ac"}

    monkeypatch.setattr(cli, "capture_live_microphone", fake_live_capture)
    output = tmp_path / "live"

    result = cli.main([
        "capture", "mic", "--live", "--live-output", "jsonl",
        "--seconds", "2", "--out", str(output),
    ])

    captured = capsys.readouterr()
    assert result == 0
    assert captured.out == (
        '{"timestamp_seconds":0.25,"frequency_hz":220.0,"midi":57.0,'
        '"clarity":0.91,"voiced":true,"note":"A3"}\n'
    )
    assert "praat-ac" in captured.err
    assert received["seconds"] == 2.0


def test_live_capture_rejects_files_and_alternate_final_trackers(tmp_path: Path, capsys) -> None:
    assert cli.main([
        "capture", "melody.wav", "--live", "--seconds", "2", "--out", str(tmp_path / "one"),
    ]) == 2
    assert "only available" in capsys.readouterr().err

    assert cli.main([
        "capture", "mic", "--live", "--seconds", "2", "--tracker", "pyin",
        "--out", str(tmp_path / "two"),
    ]) == 2
    assert "finalizes with Praat" in capsys.readouterr().err


def test_human_live_output_is_rate_limited(capsys) -> None:
    sink = cli._live_frame_sink("human")
    for index in range(5):
        sink(LivePitchFrame(index * 0.02, 220.0, 57.0, 0.9, True, "A3"))

    assert len(capsys.readouterr().out.splitlines()) == 1
