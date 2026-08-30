from __future__ import annotations

import builtins

import numpy as np
import pytest

from voice_to_strudel.model import Audio
from voice_to_strudel.pitch import track_pitch, track_pyin


def test_tracker_dispatch_rejects_unknown_name() -> None:
    audio = Audio(np.zeros(2_205), 22_050)

    with pytest.raises(ValueError, match="unknown tracker: other"):
        track_pitch(audio, tracker="other")


def test_pyin_explains_how_to_install_optional_dependency(monkeypatch) -> None:
    real_import = builtins.__import__

    def import_without_librosa(name, *args, **kwargs):
        if name == "librosa":
            raise ImportError("not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_librosa)

    with pytest.raises(RuntimeError, match="optional 'pyin' dependency"):
        track_pyin(Audio(np.zeros(2_205), 22_050))
