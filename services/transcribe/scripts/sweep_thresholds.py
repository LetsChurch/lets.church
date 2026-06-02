"""2D sweep over wtpsplit's `threshold` (sentence) AND
`paragraph_threshold` (paragraph). Production code passes a single
`threshold` value to SaT.split — but the SaT API has two independent
knobs:

- `threshold` controls sentence boundaries (lower → more splits, smaller
  sentences).
- `paragraph_threshold` controls paragraph boundaries among the resulting
  sentences (lower → more paragraphs, shorter paragraphs).

Production has been pinning `threshold=0.4` and leaving
`paragraph_threshold` at the wtpsplit default of 0.5. This sweep
evaluates the full 2D grid so we can confirm or replace those.

Input transcripts may contain newlines from prior whisper output. We
flatten to a single line first because SaT defaults to
`split_on_input_newlines=True` — leaving newlines in would force
paragraph breaks at every newline regardless of either threshold.

Loads SaT once; a 7-file × 5-thresh × 5-thresh sweep (175 splits)
takes a few minutes on CPU.

Usage (inside the transcribe-worker container):
    uv run --no-sync python scripts/sweep_thresholds.py \
        /seed-data/eval/transcript1.txt ... /seed-data/eval/short.txt
"""

from __future__ import annotations

import re
import statistics
import sys
from pathlib import Path

import torch
from wtpsplit import SaT

MODEL = "sat-12l-sm"


def select_device() -> str:
    """Prefer MPS (Apple Silicon Metal) → CUDA → CPU.
    SaT instantiates the inner transformer on CPU by default; this
    sweep tunes it to whichever device is fastest available, which on
    macOS native is MPS and is roughly 3-5× faster than CPU on
    SubwordXLMForTokenClassification."""
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


SENTENCE_THRESHOLDS = [0.2, 0.4, 0.5, 0.6, 0.8]
PARAGRAPH_THRESHOLDS = [0.2, 0.4, 0.5, 0.6, 0.8]

# Target band: a paragraph reads as "natural prose" with roughly 2-5
# sentences in it. Below ~2 the output fragments into too many
# one-sentence paragraphs; above ~5 paragraphs become walls of text
# that hurt readability and break the YouTube-style outline panel.
TARGET_SENT_MIN = 2.0
TARGET_SENT_MAX = 5.0
TARGET_SENT_CENTER = (TARGET_SENT_MIN + TARGET_SENT_MAX) / 2

# Secondary band: characters per paragraph. ~200-600 reads as one
# paragraph at typical reading widths; below 100 is fragmented,
# above 1000 is too long.
TARGET_CHARS_MIN = 200.0
TARGET_CHARS_MAX = 600.0
TARGET_CHARS_CENTER = (TARGET_CHARS_MIN + TARGET_CHARS_MAX) / 2


def describe(values: list[float]) -> dict[str, float]:
    if not values:
        return {"n": 0, "min": 0, "p50": 0, "mean": 0, "p90": 0, "max": 0}
    s = sorted(values)
    n = len(s)
    return {
        "n": n,
        "min": s[0],
        "p50": s[n // 2],
        "mean": sum(s) / n,
        "p90": s[max(0, int(n * 0.9) - 1)] if n > 1 else s[0],
        "max": s[-1],
    }


def flatten(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def stats_for(
    sat: SaT,
    text: str,
    sentence_threshold: float,
    paragraph_threshold: float,
) -> tuple[dict[str, float], dict[str, float], int, float]:
    paras = sat.split(
        text,
        threshold=sentence_threshold,
        paragraph_threshold=paragraph_threshold,
        do_paragraph_segmentation=True,
    )
    paras = [p for p in paras if p]
    sentence_counts = [float(len(p)) for p in paras]
    paragraph_chars = [float(sum(len(s.strip()) for s in p) + max(0, len(p) - 1)) for p in paras]
    stdev = statistics.pstdev(sentence_counts) if len(sentence_counts) > 1 else 0.0
    return describe(sentence_counts), describe(paragraph_chars), len(paras), stdev


def score(sent_mean: float, char_mean: float, stdev: float) -> float:
    """Lower is better. Distance from band centroids on both axes,
    plus a light stdev penalty for uniformity. Bands are zero-cost
    inside; out-of-band pays linear distance."""
    if TARGET_SENT_MIN <= sent_mean <= TARGET_SENT_MAX:
        sent_pen = 0.0
    else:
        sent_pen = min(
            abs(sent_mean - TARGET_SENT_MIN),
            abs(sent_mean - TARGET_SENT_MAX),
        )
    if TARGET_CHARS_MIN <= char_mean <= TARGET_CHARS_MAX:
        char_pen = 0.0
    else:
        char_pen = (
            min(
                abs(char_mean - TARGET_CHARS_MIN),
                abs(char_mean - TARGET_CHARS_MAX),
            )
            / 100.0  # rescale so chars-distance isn't 100× the sent-distance
        )
    # stdev gets a small weight so when two cells tie on band fit, the
    # one with more uniform paragraphs wins.
    return sent_pen + char_pen + 0.1 * stdev


def main(paths: list[str]) -> None:
    device = select_device()
    print(f"# Loading {MODEL} on {device}...")
    sat = SaT(MODEL)
    # `sat.model` is wtpsplit's PyTorchWrapper; the underlying
    # nn.Module is `.model.model`. Move it once at startup so every
    # `sat.split(...)` runs on the chosen device.
    if device != "cpu":
        sat.model.model.to(device)
    print(
        f"# 2D sweep: sentence_threshold × paragraph_threshold\n"
        f"# {SENTENCE_THRESHOLDS} × {PARAGRAPH_THRESHOLDS} across {len(paths)} files\n"
        f"# Target: sent/para mean in [{TARGET_SENT_MIN}, {TARGET_SENT_MAX}], "
        f"chars/para mean in [{TARGET_CHARS_MIN}, {TARGET_CHARS_MAX}]\n"
    )

    # Aggregate scores per (sent_thr, para_thr) across all files, so
    # we can pick a single combo that works well on average.
    grid_scores: dict[tuple[float, float], list[float]] = {
        (s, p): [] for s in SENTENCE_THRESHOLDS for p in PARAGRAPH_THRESHOLDS
    }
    per_file_picks: list[tuple[str, float, float]] = []

    for path in paths:
        raw = Path(path).read_text().strip()
        if not raw:
            print(f"## {path}: empty\n")
            continue
        text = flatten(raw)
        print(f"## {path} ({len(text):,} chars, flattened from {len(raw):,})")
        # Print a sentence-mean grid + a chars-mean grid for visual scan.
        print("  sent_thr ╲ para_thr " + " ".join(f"{p:>6.2f}" for p in PARAGRAPH_THRESHOLDS))
        sent_grid: dict[tuple[float, float], float] = {}
        char_grid: dict[tuple[float, float], float] = {}
        cell_scores: dict[tuple[float, float], float] = {}
        best_cell = None
        best_score = float("inf")
        for s_thr in SENTENCE_THRESHOLDS:
            row_cells = []
            for p_thr in PARAGRAPH_THRESHOLDS:
                sent_stats, char_stats, _n, stdev = stats_for(sat, text, s_thr, p_thr)
                sent_mean = sent_stats["mean"]
                char_mean = char_stats["mean"]
                sent_grid[(s_thr, p_thr)] = sent_mean
                char_grid[(s_thr, p_thr)] = char_mean
                c_score = score(sent_mean, char_mean, stdev)
                cell_scores[(s_thr, p_thr)] = c_score
                grid_scores[(s_thr, p_thr)].append(c_score)
                row_cells.append(f"{sent_mean:>6.2f}")
                if c_score < best_score:
                    best_score = c_score
                    best_cell = (s_thr, p_thr)
            print(f"  sent_thr={s_thr:.2f} (sent/para): " + " ".join(row_cells))
        print()
        print("  sent_thr ╲ para_thr " + " ".join(f"{p:>6.2f}" for p in PARAGRAPH_THRESHOLDS))
        for s_thr in SENTENCE_THRESHOLDS:
            row_cells = [f"{char_grid[(s_thr, p_thr)]:>6.0f}" for p_thr in PARAGRAPH_THRESHOLDS]
            print(f"  sent_thr={s_thr:.2f} (chars/par): " + " ".join(row_cells))
        if best_cell is not None:
            per_file_picks.append((path, best_cell[0], best_cell[1]))
            print(
                f"  -> best cell: sentence_threshold={best_cell[0]:.2f}, "
                f"paragraph_threshold={best_cell[1]:.2f} "
                f"(sent/para mean={sent_grid[best_cell]:.2f}, "
                f"chars/para mean={char_grid[best_cell]:.0f}, "
                f"score={cell_scores[best_cell]:.2f})"
            )
        print()

    # Aggregate: lowest mean score across files wins. Tiebreak: lower
    # variance across files (so the recommendation generalises).
    summary = [
        (
            sent_thr,
            para_thr,
            sum(scores) / len(scores) if scores else float("inf"),
            statistics.pstdev(scores) if len(scores) > 1 else 0.0,
        )
        for (sent_thr, para_thr), scores in grid_scores.items()
        if scores
    ]
    summary.sort(key=lambda r: (r[2], r[3]))

    print("## overall (sorted by mean score across files, lower = better)")
    print(f"{'sent_thr':>8} {'para_thr':>8} {'mean_score':>10} {'score_stdev':>11}")
    for sent_thr, para_thr, mean_s, stdev_s in summary[:10]:
        print(f"{sent_thr:>8.2f} {para_thr:>8.2f} {mean_s:>10.3f} {stdev_s:>11.3f}")

    if summary:
        winner = summary[0]
        print(
            f"\nOverall recommendation: sentence_threshold={winner[0]:.2f}, "
            f"paragraph_threshold={winner[1]:.2f}\n"
            f"  mean score across {len(paths)} files: {winner[2]:.3f}\n"
            f"  per-file best cells: "
            f"{', '.join(f'{Path(p).name} → ({s:.2f}, {pt:.2f})' for p, s, pt in per_file_picks)}"
        )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: sweep_thresholds.py <file.txt> [...]", file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1:])
