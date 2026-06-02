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


def merge_paragraphs_by_chars(
    segments: list[dict[str, Any]],
    target_chars: int,
) -> None:
    """Re-flag `is_paragraph_start` so paragraphs aggregate to at least
    `target_chars`. Mutates segments in place.

    Soft lower bound: a paragraph keeps absorbing the next sentence
    until its accumulated text length reaches the target; then the
    next sentence opens a new paragraph. Natural sentence boundaries
    are preserved (we never split mid-sentence) — we just emit fewer
    paragraph markers. `paragraph_idx` is renumbered to match so a
    debugger dump stays consistent with the new boundaries.

    Caller is responsible for scoping this to a single speaker group;
    crossing speakers would silently merge across `is_paragraph_start`
    re-resets, which is wrong. `process_speaker_segments` calls this
    per-group, then concatenates the groups.

    `target_chars <= 0` is a no-op so callers can plumb through "off"
    without a conditional at the call site.
    """
    if target_chars <= 0 or not segments:
        return
    current_chars = 0
    current_idx = 0
    for i, seg in enumerate(segments):
        text_len = len(seg.get("text", ""))
        if i == 0:
            seg["is_paragraph_start"] = True
            seg["paragraph_idx"] = 0
            current_chars = text_len
            current_idx = 0
            continue
        if current_chars >= target_chars:
            current_idx += 1
            seg["is_paragraph_start"] = True
            seg["paragraph_idx"] = current_idx
            current_chars = text_len
        else:
            seg["is_paragraph_start"] = False
            seg["paragraph_idx"] = current_idx
            # +1 for the implicit space that joins sentences when the
            # paragraph is reconstructed downstream — keeps the
            # accumulator honest about rendered length.
            current_chars += text_len + 1


def process_speaker_segments(
    segments: list[dict[str, Any]],
    sat_model,
    threshold: float = 0.4,
    paragraph_threshold: float = 0.5,
    paragraph_target_chars: int = 0,
) -> list[dict[str, Any]]:
    """Re-segment by speaker turn through wtpsplit; preserve per-word timings.

    Thin orchestrator: groups by speaker, runs the SaT model once per turn, then
    delegates the deterministic mapping/casing to the pure helpers above. Falls
    back to the original segments for a turn when it has no words, no usable
    text, the model raises, or nothing maps.

    `threshold` is wtpsplit's sentence-boundary threshold; `paragraph_threshold`
    is the paragraph-boundary threshold (defaults to wtpsplit's own 0.5, but
    set explicitly here so a future SaT default change doesn't silently shift
    output). `paragraph_target_chars > 0` merges adjacent paragraphs within
    each speaker group until each accumulated paragraph reaches that many
    characters — wtpsplit's paragraph_threshold rarely fires on continuous
    ASR-style transcripts (the model's paragraph signal was trained on text
    with explicit newlines), so this is the knob that actually controls
    paragraph size for the audience-facing transcript view.
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
                combined,
                do_paragraph_segmentation=True,
                threshold=threshold,
                paragraph_threshold=paragraph_threshold,
            )
        except Exception as exc:
            logger.warning(f"wtpsplit failed for speaker {speaker}: {exc}")
            processed.extend(group_segments)
            continue

        produced = sentences_to_segments(paragraphs, words, speaker)
        if produced:
            # Char-count merge runs PER speaker group — bridging the
            # group boundary would silently glue together two speakers'
            # last/first sentences. The downstream group-by-paragraph
            # walker only respects is_paragraph_start within a group
            # anyway, so this scoping matches the downstream model.
            merge_paragraphs_by_chars(produced, paragraph_target_chars)
            processed.extend(produced)
        else:
            logger.warning(
                f"wtpsplit produced no usable sentences for speaker {speaker}; "
                "keeping original segments"
            )
            processed.extend(group_segments)

    capitalize_segment_starts(processed)
    return processed
