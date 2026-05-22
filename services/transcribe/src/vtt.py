"""Pure text/subtitle shaping for transcript output.

Stdlib-only (no torch/sklearn/temporalio) so it's cheap to unit-test in
isolation. Consumed by activities.py to build the VTT, plaintext, and JSON
artifacts from wtpsplit-segmented sentences.
"""

from __future__ import annotations

from typing import Any

# Max wall-clock duration of a single VTT cue. Sentences longer than this are
# split at word boundaries so subtitles don't linger on screen. Display-only —
# the JSON/plaintext keep full paragraph structure.
VTT_MAX_CUE_SECONDS = 6.0


def format_timestamp(seconds: float) -> str:
    """Format seconds as a WebVTT timestamp (HH:MM:SS.mmm)."""
    if seconds < 0:
        seconds = 0
    total_ms = int(round(seconds * 1000))
    hours, rem_ms = divmod(total_ms, 3600 * 1000)
    minutes, rem_ms = divmod(rem_ms, 60 * 1000)
    secs, ms = divmod(rem_ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def group_paragraphs(segments: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group consecutive sentence-segments into paragraphs.

    `is_paragraph_start=True` on a non-first segment marks the boundary.
    `paragraph_idx` is per-speaker-group, so we can't compare it across speakers;
    use `is_paragraph_start` instead.
    """
    paragraphs: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for i, seg in enumerate(segments):
        if i > 0 and seg.get("is_paragraph_start"):
            if current:
                paragraphs.append(current)
            current = []
        current.append(seg)
    if current:
        paragraphs.append(current)
    return paragraphs


def cue_chunks(seg: dict[str, Any], max_seconds: float) -> list[tuple[float, float, str]]:
    """Break one sentence-segment into (start, end, text) cues under `max_seconds`.

    Splits on word boundaries. A sentence that already fits — or has no per-word
    timings to split on — yields a single cue using the segment's own text.
    A single word longer than `max_seconds` becomes its own (over-length) cue,
    since we can't split below a word.
    """
    start = float(seg.get("start", 0.0))
    end = float(seg.get("end", 0.0))
    text = str(seg.get("text", "")).strip()
    if not text:
        return []

    words = seg.get("words") or []
    if end - start <= max_seconds or not words:
        return [(start, end, text)]

    cues: list[tuple[float, float, str]] = []
    chunk: list[dict[str, Any]] = []
    chunk_start = float(words[0]["start"])
    for w in words:
        if chunk and float(w["end"]) - chunk_start > max_seconds:
            cues.append(
                (
                    chunk_start,
                    float(chunk[-1]["end"]),
                    " ".join(str(x["word"]).strip() for x in chunk).strip(),
                )
            )
            chunk = []
            chunk_start = float(w["start"])
        chunk.append(w)
    if chunk:
        cues.append(
            (
                chunk_start,
                float(chunk[-1]["end"]),
                " ".join(str(x["word"]).strip() for x in chunk).strip(),
            )
        )
    return cues


def segments_to_vtt(
    segments: list[dict[str, Any]], max_cue_seconds: float = VTT_MAX_CUE_SECONDS
) -> str:
    """WebVTT with one cue per sentence, splitting sentences longer than
    `max_cue_seconds` at word boundaries.

    Paragraph breaks are inherently cue breaks here — every paragraph boundary is
    also a sentence boundary — so this stays consistent with the paragraph
    structure in the JSON/plaintext while keeping cues short enough to read.
    """
    lines = ["WEBVTT", ""]
    emitted = False
    for seg in segments:
        for start, end, text in cue_chunks(seg, max_cue_seconds):
            if not text:
                continue
            lines.append(f"{format_timestamp(start)} --> {format_timestamp(end)}")
            lines.append(text)
            lines.append("")
            emitted = True
    return "\n".join(lines) if emitted else "WEBVTT"


def segments_to_plaintext(segments: list[dict[str, Any]]) -> str:
    """Paragraphs joined with \\n\\n, sentences within paragraph joined with spaces."""
    paragraphs = group_paragraphs(segments)
    return "\n\n".join(
        " ".join(str(s.get("text", "")).strip() for s in para).strip() for para in paragraphs
    ).strip()
