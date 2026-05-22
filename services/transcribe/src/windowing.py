"""Segment → fixed-size window slicing for speaker-embedding extraction.

Stdlib-only so it's cheap to unit-test in isolation. The actual embedding +
clustering lives in diarization.py (which needs torch/sklearn); this just
computes the time windows.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Window:
    seg_index: int
    start: float
    end: float


def windows_for_segment(
    seg_index: int,
    start: float,
    end: float,
    window_size: float,
    hop: float,
) -> list[Window]:
    """Cover [start, end] with overlapping `window_size` windows stepped by `hop`.

    A segment shorter than `window_size` becomes a single window. A tail window
    is appended so coverage reaches `end` when the last stepped window stops short.
    """
    duration = end - start
    if duration <= 0:
        return []
    if duration <= window_size:
        return [Window(seg_index, start, end)]

    windows: list[Window] = []
    t = start
    while t + window_size <= end:
        windows.append(Window(seg_index, t, t + window_size))
        t += hop
    # Tail window so we cover up to `end`.
    if windows and windows[-1].end < end - 0.05:
        windows.append(Window(seg_index, max(start, end - window_size), end))
    return windows
