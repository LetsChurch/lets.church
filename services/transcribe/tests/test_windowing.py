"""Tests for src/windowing.py window generation."""

from __future__ import annotations

from src.windowing import Window, windows_for_segment


def test_zero_or_negative_duration_yields_nothing():
    assert windows_for_segment(0, 5.0, 5.0, window_size=1.5, hop=0.75) == []
    assert windows_for_segment(0, 5.0, 4.0, window_size=1.5, hop=0.75) == []


def test_short_segment_is_single_window_covering_the_span():
    assert windows_for_segment(3, 10.0, 11.0, window_size=1.5, hop=0.75) == [Window(3, 10.0, 11.0)]


def test_overlapping_windows_no_tail_when_last_reaches_end():
    # 0..3 with 1.5s windows / 0.75 hop lands exactly on the end → no tail window.
    got = windows_for_segment(0, 0.0, 3.0, window_size=1.5, hop=0.75)
    assert got == [
        Window(0, 0.0, 1.5),
        Window(0, 0.75, 2.25),
        Window(0, 1.5, 3.0),
    ]


def test_tail_window_appended_when_stepping_stops_short():
    # 0..4 with no overlap (hop == window) leaves a gap → tail window covers the end.
    got = windows_for_segment(7, 0.0, 4.0, window_size=1.5, hop=1.5)
    assert got == [
        Window(7, 0.0, 1.5),
        Window(7, 1.5, 3.0),
        Window(7, 2.5, 4.0),  # tail: max(start, end - window_size) .. end
    ]


def test_seg_index_is_propagated():
    for w in windows_for_segment(42, 0.0, 5.0, window_size=1.5, hop=0.75):
        assert w.seg_index == 42


def test_windows_never_extend_past_end():
    for w in windows_for_segment(0, 0.0, 5.3, window_size=1.5, hop=0.75):
        assert w.end <= 5.3 + 1e-9
        assert w.start >= 0.0
