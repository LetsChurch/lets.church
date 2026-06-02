"""Re-apply the production paragraph segmentation to every committed
LLM seed snapshot under `seed-data/llm/*.json`, without re-running
whisper. Each snapshot already carries per-word timings + speaker
labels (the original transcribe output); the only thing that's
changed is the paragraph layout that wtpsplit + the char-target
merge produce, so we reuse the words and just regroup.

This script is a one-shot — designed to be run after the segmentation
defaults change (e.g. a new `PARAGRAPH_TARGET_CHARS`). It does NOT
preserve annotations, summary, or embeddings: those reference
paragraph IDs / text that will shift, so the right move is to clear
them and re-derive via `just generate-seed-annotations` +
`just generate-seed-summaries` + `just dump-llm-seed-data`.

Usage (native macOS for MPS, or inside the transcribe-worker container):
    uv --project services/transcribe run --no-sync python \
        services/transcribe/scripts/resegment_seed_snapshots.py \
        seed-data/llm/*.json
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import torch
from wtpsplit import SaT

# Resolve repo-relative `services/transcribe/src` so `process_speaker_segments`
# imports cleanly whether the script is invoked from the repo root or from
# inside the transcribe-worker container.
HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "src"
if str(SRC.parent) not in sys.path:
    sys.path.insert(0, str(SRC.parent))

from src.segmentation import process_speaker_segments  # noqa: E402


def select_device() -> str:
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def paragraphs_to_input_segments(paragraphs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reshape snapshot paragraphs into the whisper-segment format
    `process_speaker_segments` expects. Each existing paragraph
    becomes one input segment; the segmenter will regroup them based
    on words + speaker turns."""
    segs: list[dict[str, Any]] = []
    for p in paragraphs:
        segs.append(
            {
                "start": p["start"],
                "end": p["end"],
                "text": p["text"],
                "speaker": p.get("speaker"),
                "words": [
                    {
                        "word": w["word"],
                        "start": w["start"],
                        "end": w["end"],
                        "probability": w.get("probability", 1.0),
                    }
                    for w in p.get("words", [])
                ],
            }
        )
    return segs


def regroup_by_paragraph_start(
    segments: list[dict[str, Any]],
    speaker_embedding_by_speaker: dict[str, list[float] | None],
) -> list[dict[str, Any]]:
    """Walk sentence-level segments and emit one snapshot paragraph
    per run sharing the same `is_paragraph_start=False` chain. Mirrors
    the TS `store-transcript-paragraphs` activity's grouping but
    produces the snapshot-JSON shape (`order` instead of `id`, no
    annotations/embedding).
    """
    out: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    order = 0
    for seg in segments:
        speaker = seg.get("speaker")
        if current is None or seg.get("is_paragraph_start") or current["speaker"] != speaker:
            if current is not None:
                out.append(current)
                order += 1
            current = {
                "order": order,
                "start": seg["start"],
                "end": seg["end"],
                "speaker": speaker,
                "speakerEmbedding": speaker_embedding_by_speaker.get(speaker)
                if speaker is not None
                else None,
                "text": seg["text"],
                "words": [
                    {"word": w["word"], "start": w["start"], "end": w["end"]}
                    for w in seg.get("words", [])
                ],
                "embedding": None,
                "annotations": [],
            }
        else:
            current["text"] = (current["text"] + " " + seg["text"]).strip()
            current["end"] = seg["end"]
            current["words"].extend(
                {"word": w["word"], "start": w["start"], "end": w["end"]}
                for w in seg.get("words", [])
            )
    if current is not None:
        out.append(current)
    return out


def reprocess_one(sat: SaT, path: Path, env: dict[str, str]) -> tuple[int, int]:
    snap = json.loads(path.read_text())
    paragraphs = snap.get("paragraphs", [])
    before = len(paragraphs)

    speaker_embedding_by_speaker: dict[str, list[float] | None] = {}
    for p in paragraphs:
        speaker = p.get("speaker")
        if speaker is not None and speaker not in speaker_embedding_by_speaker:
            speaker_embedding_by_speaker[speaker] = p.get("speakerEmbedding")

    in_segs = paragraphs_to_input_segments(paragraphs)
    out_segs = process_speaker_segments(
        in_segs,
        sat,
        threshold=float(env.get("WTPSPLIT_SENTENCE_THRESHOLD", "0.4")),
        paragraph_threshold=float(env.get("WTPSPLIT_PARAGRAPH_THRESHOLD", "0.5")),
        paragraph_target_chars=int(env.get("PARAGRAPH_TARGET_CHARS", "200")),
    )
    new_paragraphs = regroup_by_paragraph_start(out_segs, speaker_embedding_by_speaker)

    # Wipe LLM-derived state — paragraph IDs/text just changed, so
    # annotations, summaries, and embeddings would all be referencing
    # something that no longer exists. The downstream regen scripts
    # repopulate everything from these fresh paragraphs.
    snap["paragraphs"] = new_paragraphs
    snap["summary"] = ""
    snap["searchSummary"] = ""
    snap["sections"] = []
    snap["summaryEmbedding"] = [0.0]
    snap["searchSummaryEmbedding"] = [0.0]
    snap["summarizedAt"] = "1970-01-01T00:00:00.000Z"

    path.write_text(json.dumps(snap))
    return before, len(new_paragraphs)


def main(paths: list[str]) -> None:
    device = select_device()
    print(f"# Loading SaT on {device}...")
    sat = SaT(os.getenv("WTPSPLIT_MODEL", "sat-12l-sm"))
    if device != "cpu":
        sat.model.model.to(device)

    print(
        f"# Re-segmenting {len(paths)} snapshot(s) with "
        f"sentence_threshold={os.getenv('WTPSPLIT_SENTENCE_THRESHOLD', '0.4')}, "
        f"paragraph_threshold={os.getenv('WTPSPLIT_PARAGRAPH_THRESHOLD', '0.5')}, "
        f"paragraph_target_chars={os.getenv('PARAGRAPH_TARGET_CHARS', '200')}\n"
    )

    env = dict(os.environ)
    total_before = 0
    total_after = 0
    for p in paths:
        path = Path(p)
        before, after = reprocess_one(sat, path, env)
        total_before += before
        total_after += after
        print(f"  {path.name}: {before} → {after} paragraphs")

    print(
        f"\nDone. Total paragraphs across {len(paths)} files: "
        f"{total_before} → {total_after} "
        f"(avg {total_before / len(paths):.1f} → {total_after / len(paths):.1f} per upload)."
    )
    print(
        "\nNext steps:\n"
        "  1. just truncate && just seed-db          # load updated snapshots\n"
        "  2. just generate-seed-annotations         # re-annotate\n"
        "  3. just generate-seed-summaries           # re-summarize + re-embed\n"
        "  4. just dump-llm-seed-data                # capture the result"
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "usage: resegment_seed_snapshots.py <snapshot.json> [...]",
            file=sys.stderr,
        )
        sys.exit(2)
    main(sys.argv[1:])
