#!/usr/bin/env python3
"""Pre-warm model caches at Docker build time via huggingface_hub.

We deliberately avoid importing nemo/torch/faster_whisper/wtpsplit here — those
imports trigger CUDA probing or load native extensions that segfault during
`docker build` when no GPU is available (Apple Silicon Docker Desktop,
no-GPU Linux builders, CI). Instead we snapshot the underlying repos straight
into the HF cache; at runtime, the worker libraries pick them up from there.
"""

from __future__ import annotations

import os
import sys
import time
import traceback

# Belt-and-braces: hide CUDA from any transitive import that decides to probe.
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("NEMO_DISABLE_TELEMETRY", "1")


def _snapshot(repo_id: str, *, attempts: int = 3) -> None:
    from huggingface_hub import snapshot_download

    token = os.getenv("HUGGINGFACE_TOKEN") or None
    print(f"Snapshotting {repo_id}")
    # Retry with backoff to ride out transient HF/CDN hiccups during build.
    # Notes on bounds:
    #  - We *don't* set a wall-clock timeout on the whole download — large-v3
    #    is multi-GB and legitimately takes minutes on slow runners.
    #  - `etag_timeout=30` (default 10) caps the HEAD/metadata request, which
    #    is the usual culprit when builds hang (slow auth/redirects).
    #  - Body-chunk stalls are governed by huggingface_hub's own
    #    `HF_HUB_DOWNLOAD_TIMEOUT` env var; leaving that to its default.
    # snapshot_download resumes partial files between attempts, so a retry
    # picks up where the previous one died rather than re-downloading.
    delay = 5.0
    for attempt in range(1, attempts + 1):
        try:
            snapshot_download(repo_id=repo_id, token=token, etag_timeout=30)
            print(f"OK {repo_id}")
            return
        except Exception as exc:
            if attempt == attempts:
                raise
            print(
                f"snapshot {repo_id} attempt {attempt}/{attempts} failed: {exc}; "
                f"retrying in {delay:.0f}s"
            )
            time.sleep(delay)
            delay *= 3


def _whisper_repo(model_name: str) -> str:
    """Resolve a faster-whisper short name to its HF repo id."""
    if "/" in model_name:
        return model_name
    # Mirrors faster_whisper.utils._MODELS — short names map to Systran-hosted
    # CTranslate2 conversions of the OpenAI whisper checkpoints.
    return f"Systran/faster-whisper-{model_name}"


def _wtpsplit_repo(model_name: str) -> str:
    """Resolve a wtpsplit SaT short name to its HF repo id."""
    if "/" in model_name:
        return model_name
    return f"segment-any-text/{model_name}"


def main() -> None:
    whisper_model = os.getenv("WHISPER_MODEL", "base")
    wtpsplit_model = os.getenv("WTPSPLIT_MODEL", "sat-12l-sm")
    titanet_model = os.getenv("TITANET_MODEL", "nvidia/speakerverification_en_titanet_large")

    print("Pre-warming model caches for services/transcribe")

    try:
        _snapshot(_whisper_repo(whisper_model))
        _snapshot(_wtpsplit_repo(wtpsplit_model))
        _snapshot(titanet_model)
    except Exception as exc:
        print(f"ERROR: failed to download models: {exc}")
        traceback.print_exc()
        sys.exit(1)

    print("All models cached.")


if __name__ == "__main__":
    main()
