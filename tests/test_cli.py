from __future__ import annotations

from pathlib import Path

from voice_to_strudel import cli


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
