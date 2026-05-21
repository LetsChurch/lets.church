"""Sentence and paragraph segmentation using wtpsplit's SaT model.

We run wtpsplit per contiguous speaker turn (so cross-speaker sentences don't
get glued together), then map the punctuated/cased output tokens back to the
original word timings.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)


_PUNCT_RE = re.compile(r"[^\w\s]")


def _normalize(word: str) -> str:
    return _PUNCT_RE.sub("", word).lower().strip()


def process_speaker_segments(
    segments: list[dict],
    sat_model,
    threshold: float = 0.4,
) -> list[dict]:
    """Re-segment by speaker turn through wtpsplit; preserve per-word timings."""
    if not segments:
        return segments

    # Group consecutive segments by speaker.
    groups: list[dict] = []
    current_speaker: str | None = None
    current: list[dict] = []
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

    processed: list[dict] = []

    for group in groups:
        speaker = group["speaker"]
        group_segments = group["segments"]

        words: list[dict] = []
        for seg in group_segments:
            for w in seg.get("words", []):
                words.append(dict(w))

        if not words:
            processed.extend(group_segments)
            continue

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

        sentences: list[dict] = []
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
            processed.extend(group_segments)
            continue

        word_pos = 0
        produced_for_speaker = 0
        skipped: list[str] = []

        for sent in sentences:
            tokens = sent["text"].split()
            sent_words: list[dict] = []

            for tok in tokens:
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
                processed.append(
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
                produced_for_speaker += 1

        if skipped:
            preview = ", ".join(skipped[:10]) + (" ..." if len(skipped) > 10 else "")
            logger.warning(
                f"Skipped {len(skipped)} wtpsplit tokens for speaker {speaker}: {preview}"
            )

        if produced_for_speaker == 0:
            logger.warning(
                f"wtpsplit produced no usable sentences for speaker {speaker}; "
                "keeping original segments"
            )
            processed.extend(group_segments)

    # Title-case the first word of each segment if it's all lowercase.
    for seg in processed:
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

    return processed
