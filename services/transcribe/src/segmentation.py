"""Sentence and paragraph segmentation using wtpsplit's SaT model.

We run wtpsplit per contiguous speaker turn (so cross-speaker sentences don't
get glued together), then map the punctuated/cased output tokens back to the
original word timings.

The deterministic work is factored into pure functions —
`group_consecutive_by_speaker`, `sentences_to_segments`, and
`capitalize_segment_starts` — so it can be tested with real inputs.
`process_speaker_segments` is the thin orchestrator whose only impurity is the
`sat_model.split` call.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


_PUNCT_RE = re.compile(r"[^\w\s]")


def _normalize(word: str) -> str:
    return _PUNCT_RE.sub("", word).lower().strip()


def group_consecutive_by_speaker(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group consecutive segments that share a `speaker` into speaker turns.

    Returns a list of {"speaker": <label|None>, "segments": [...]} preserving order.
    """
    groups: list[dict[str, Any]] = []
    current_speaker: Any = None
    current: list[dict[str, Any]] = []
    for seg in segments:
        speaker = seg.get("speaker")
        if speaker != current_speaker:
            if current:
                groups.append({"speaker": current_speaker, "segments": current})
            current_speaker = speaker
            current = [seg]
        else:
            current.append(seg)
    if current:
        groups.append({"speaker": current_speaker, "segments": current})
    return groups


def sentences_to_segments(
    paragraphs: list[list[str]],
    words: list[dict[str, Any]],
    speaker: Any,
) -> list[dict[str, Any]]:
    """Map wtpsplit's paragraph/sentence split back onto the original words.

    Pure: takes the already-split `paragraphs` (list of paragraphs, each a list
    of sentence strings) plus the speaker turn's `words`, and produces sentence
    segments with restored terminal punctuation, paragraph markers, and per-word
    timings carried over from `words`. Casing is left untouched here — see
    `capitalize_segment_starts`. Returns an empty list when nothing maps (the
    caller treats that as a signal to fall back to the original segments).
    """
    sentences: list[dict[str, Any]] = []
    for para_idx, paragraph in enumerate(paragraphs):
        for sent_idx, sentence in enumerate(paragraph):
            text = sentence.strip()
            if not text:
                continue
            if not text.endswith((".", "!", "?", ";")):
                text += "."
            sentences.append(
                {
                    "text": text,
                    "paragraph_idx": para_idx,
                    "is_paragraph_start": sent_idx == 0,
                }
            )

    if not sentences:
        return []

    word_pos = 0
    skipped: list[str] = []
    produced: list[dict[str, Any]] = []

    for sent in sentences:
        sent_words: list[dict[str, Any]] = []
        for tok in sent["text"].split():
            tok_norm = _normalize(tok)
            if not tok_norm:
                continue

            matched = False
            search_end = min(word_pos + 10, len(words))
            for i in range(word_pos, search_end):
                orig_norm = _normalize(words[i]["word"])
                if orig_norm == tok_norm or tok_norm.startswith(orig_norm):
                    updated = dict(words[i])
                    updated["word"] = tok
                    sent_words.append(updated)
                    word_pos = i + 1
                    matched = True
                    break

            if not matched:
                skipped.append(tok)

        if sent_words:
            produced.append(
                {
                    "start": sent_words[0]["start"],
                    "end": sent_words[-1]["end"],
                    "text": sent["text"],
                    "speaker": speaker,
                    "words": sent_words,
                    "paragraph_idx": sent["paragraph_idx"],
                    "is_paragraph_start": sent["is_paragraph_start"],
                }
            )

    if skipped:
        preview = ", ".join(skipped[:10]) + (" ..." if len(skipped) > 10 else "")
        logger.warning(f"Skipped {len(skipped)} wtpsplit tokens for speaker {speaker}: {preview}")

    return produced


def capitalize_segment_starts(segments: list[dict[str, Any]]) -> None:
    """Title-case the first word of each segment (and its text) when it's all
    lowercase. Mutates in place."""
    for seg in segments:
        words = seg.get("words", [])
        if not words:
            continue
        first_text = words[0].get("word", "")
        norm = _normalize(first_text)
        if norm and norm.islower():
            words[0]["word"] = (
                first_text[0].upper() + first_text[1:]
                if len(first_text) > 1
                else first_text.upper()
            )
            seg_tokens = seg["text"].split()
            if seg_tokens:
                seg_tokens[0] = (
                    seg_tokens[0][0].upper() + seg_tokens[0][1:]
                    if len(seg_tokens[0]) > 1
                    else seg_tokens[0].upper()
                )
                seg["text"] = " ".join(seg_tokens)


def process_speaker_segments(
    segments: list[dict[str, Any]],
    sat_model,
    threshold: float = 0.4,
) -> list[dict[str, Any]]:
    """Re-segment by speaker turn through wtpsplit; preserve per-word timings.

    Thin orchestrator: groups by speaker, runs the SaT model once per turn, then
    delegates the deterministic mapping/casing to the pure helpers above. Falls
    back to the original segments for a turn when it has no words, no usable
    text, the model raises, or nothing maps.
    """
    if not segments:
        return segments

    processed: list[dict[str, Any]] = []

    for group in group_consecutive_by_speaker(segments):
        speaker = group["speaker"]
        group_segments = group["segments"]

        words: list[dict[str, Any]] = []
        for seg in group_segments:
            for w in seg.get("words", []):
                words.append(dict(w))

        combined = " ".join(w["word"] for w in words).strip()
        if not combined:
            processed.extend(group_segments)
            continue

        try:
            paragraphs = sat_model.split(
                combined, do_paragraph_segmentation=True, threshold=threshold
            )
        except Exception as exc:
            logger.warning(f"wtpsplit failed for speaker {speaker}: {exc}")
            processed.extend(group_segments)
            continue

        produced = sentences_to_segments(paragraphs, words, speaker)
        if produced:
            processed.extend(produced)
        else:
            logger.warning(
                f"wtpsplit produced no usable sentences for speaker {speaker}; "
                "keeping original segments"
            )
            processed.extend(group_segments)

    capitalize_segment_starts(processed)
    return processed
