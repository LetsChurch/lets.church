#!/usr/bin/env python3
"""Batch sibling of `transcribe_file.py` — loads models once, then loops.

For long bulk seed regenerations (e.g. all 27 seed uploads with `large-v3`)
the per-invocation model load is ~30-60s of `large-v3`, which adds up to
20-30 minutes of waste across the batch. This script reads input/output
pairs from a manifest file (one `INPUT_PATH<TAB>OUTPUT_PATH` per line) and
calls `transcribe_to_json` once per row against a single, reused
`ModelManager`. Behavior of each individual transcribe is otherwise
identical to `transcribe_file.py` (shared `src/pipeline.py` helpers).

Usage:
    docker compose exec -T transcribe-worker sh -c "cd /app && \\
        uv run --no-sync python scripts/transcribe_batch.py \\
            --manifest /seed-data/llm/regen-manifest.tsv \\
            --whisper-model large-v3"
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

# Allow both `src.*` (parent) and sibling-script (same dir) imports when
# launched as a plain script.
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent))  # /app
sys.path.insert(0, str(_HERE))  # /app/scripts (for sibling import below)

import torch  # noqa: E402
from transcribe_file import transcribe_to_json  # noqa: E402

from src.models import initialize_models  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Batch transcribe many media files with one model load. Reads a "
            "manifest of `INPUT<TAB>OUTPUT` lines from --manifest."
        ),
    )
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--whisper-model", default="base.en")
    parser.add_argument("--wtpsplit-model", default="sat-12l-sm")
    parser.add_argument("--titanet-model", default="nvidia/speakerverification_en_titanet_large")
    parser.add_argument("--no-align", action="store_true")
    args = parser.parse_args()

    pairs: list[tuple[Path, Path]] = []
    for raw in args.manifest.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 2:
            print(f"bad manifest line (need INPUT<TAB>OUTPUT): {line!r}", file=sys.stderr)
            sys.exit(2)
        pairs.append((Path(parts[0]), Path(parts[1])))

    print(f"[batch] {len(pairs)} pairs queued")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    t0 = time.time()
    print(
        f"[batch] loading models: whisper={args.whisper_model} "
        f"device={device} align={not args.no_align}"
    )
    initialize_models(
        whisper_model=args.whisper_model,
        device=device,
        compute_type=compute_type,
        wtpsplit_model=args.wtpsplit_model,
        titanet_model=args.titanet_model,
        align_enabled=not args.no_align,
    )
    print(f"[batch] models loaded in {int(time.time() - t0)}s")

    failures: list[tuple[Path, str]] = []
    for i, (in_path, out_path) in enumerate(pairs, start=1):
        if not in_path.exists():
            print(f"[batch] [{i}/{len(pairs)}] SKIP missing input: {in_path}")
            failures.append((in_path, "input not found"))
            continue
        t = time.time()
        print(f"\n[batch] [{i}/{len(pairs)}] {in_path}")
        try:
            transcribe_to_json(in_path, out_path)
        except Exception as exc:
            print(f"[batch] [{i}/{len(pairs)}] FAILED: {exc!r}")
            failures.append((in_path, str(exc)))
            continue
        print(f"[batch] [{i}/{len(pairs)}] done in {int(time.time() - t)}s")

    print(
        f"\n[batch] {len(pairs) - len(failures)}/{len(pairs)} succeeded in {int(time.time() - t0)}s"
    )
    if failures:
        for path, err in failures:
            print(f"[batch] FAIL {path}: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
