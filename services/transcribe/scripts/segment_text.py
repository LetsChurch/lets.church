"""Segment a plain-text file into paragraphs via wtpsplit's SaT model.

One-off tool for building eval inputs from a text-only transcript (i.e. no
audio, no whisper segments, just prose) — e.g. running the annotate prompt
against a hand-authored debate or sermon dump. The production transcribe
pipeline runs wtpsplit per speaker turn against words with timestamps; this
script runs it once on the whole document with no timing, because the
target use is prompt-evaluation, not real transcription.

Usage (inside the transcribe-worker container):
    uv run --no-sync python scripts/segment_text.py /path/in.txt /path/out.json

Output JSON shape:
    { "paragraphs": ["First paragraph...", "Second paragraph...", ...] }
"""

import json
import sys

from wtpsplit import SaT

# Matches the production threshold used in src/segmentation.py
DEFAULT_THRESHOLD = 0.4
DEFAULT_MODEL = "sat-12l-sm"


def main(input_path: str, output_path: str) -> None:
    with open(input_path) as f:
        text = f.read().strip()
    if not text:
        raise SystemExit(f"{input_path}: empty file")

    sat = SaT(DEFAULT_MODEL)
    paragraphs = sat.split(text, do_paragraph_segmentation=True, threshold=DEFAULT_THRESHOLD)
    # `paragraphs` is list[list[str]] — list of paragraphs, each a list of
    # sentence strings. Flatten back to one string per paragraph (wtpsplit
    # already restored sentence-boundary punctuation in its output).
    para_texts = [" ".join(s.strip() for s in p).strip() for p in paragraphs if p]
    para_texts = [p for p in para_texts if p]

    with open(output_path, "w") as f:
        json.dump({"paragraphs": para_texts}, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(para_texts)} paragraphs to {output_path} (from {len(text)} chars input)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: segment_text.py <input.txt> <output.json>", file=sys.stderr)
        raise SystemExit(2)
    main(sys.argv[1], sys.argv[2])
