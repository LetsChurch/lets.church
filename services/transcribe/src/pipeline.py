"""Pipeline helpers shared by the Temporal activity and the seed CLI.

The two callers do the same orchestration — whisper → CTC align → titanet
diarize → wtpsplit segmentation → build camelCase transcript JSON — but
they need different surrounding glue (Temporal heartbeats/progress in the
activity, plain prints in the script). The two stages most prone to silent
drift are the whisper-iter → internal-segment shape and the final JSON
serialization (any field rename here breaks every downstream consumer), so
those live here and are imported by both. The orchestration stays inline at
each call site to keep step-by-step logging / progress / heartbeats local.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Any


def iter_whisper_segments(segments_iter: Iterable[Any]) -> Iterator[dict[str, Any]]:
    """Convert faster-whisper's segment iterator to our internal dict shape.

    Yielded as a generator so callers (the activity) can interleave their own
    side effects between segments — e.g. progress updates derived from
    `seg["end"] / duration`. Eager consumers (the seed CLI) just wrap with
    `list(...)`.
    """
    for seg in segments_iter:
        words: list[dict[str, Any]] = []
        for w in seg.words or []:
            words.append(
                {
                    "word": w.word.strip() if w.word else "",
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "probability": round(w.probability, 4),
                }
            )
        yield {
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
            "words": words,
        }


def build_transcript_json(
    segments: list[dict[str, Any]],
    speaker_vectors: dict[str, list[float]],
    language: str,
    duration: float | None,
    plain_text: str,
) -> dict[str, Any]:
    """Serialize internal (snake_case) segment dicts to the camelCase JSON.

    This is the JS-consumed contract — keys are camelCase, dummies dropped,
    `originalStart`/`originalEnd` propagated from CTC alignment when present.
    Mirrored by the zod schema at
    `packages/temporal/src/util/whisper.ts::transcriptJsonSchema`.
    """
    json_segments: list[dict[str, Any]] = []
    for seg in segments:
        json_words: list[dict[str, Any]] = []
        for w in seg.get("words", []):
            word_dict: dict[str, Any] = {
                "word": str(w["word"]),
                "start": float(w["start"]),
                "end": float(w["end"]),
                "probability": float(w.get("probability", 1.0)),
                "speaker": w.get("speaker"),
            }
            # `original_*` are populated by `align_segments`; absent on words
            # that fell back to whisper timings (start/end already are the
            # originals there).
            if "original_start" in w:
                word_dict["originalStart"] = float(w["original_start"])
                word_dict["originalEnd"] = float(w["original_end"])
            json_words.append(word_dict)

        # Derive segment-level originals from the words' originals so they
        # survive wtpsplit re-segmentation. Skipped when no word carries them.
        originals = [w for w in json_words if "originalStart" in w]
        seg_dict: dict[str, Any] = {
            "start": float(seg.get("start", 0.0)),
            "end": float(seg.get("end", 0.0)),
            "text": str(seg.get("text", "")),
            "speaker": seg.get("speaker"),
            "paragraphIdx": seg.get("paragraph_idx"),
            "isParagraphStart": seg.get("is_paragraph_start"),
            "words": json_words,
        }
        if originals:
            seg_dict["originalStart"] = originals[0]["originalStart"]
            seg_dict["originalEnd"] = originals[-1]["originalEnd"]
        json_segments.append(seg_dict)

    return {
        "language": language or "en",
        "duration": duration,
        "text": plain_text,
        "speakerEmbeddings": speaker_vectors,
        "segments": json_segments,
    }
