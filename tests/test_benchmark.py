from __future__ import annotations

import numpy as np

from voice_to_strudel.benchmark import octave_error_candidates


def test_octave_metric_respects_unvoiced_gaps_and_multiple_octaves() -> None:
    assert octave_error_candidates(np.array([60.0, np.nan, 72.0])) == 0
    assert octave_error_candidates(np.array([60.0, 84.0])) == 1
    assert octave_error_candidates(np.array([60.0, 60.2, 60.4])) == 0
