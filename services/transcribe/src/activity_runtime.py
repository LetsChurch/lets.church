"""Lightweight runtime helpers shared by Temporal activities and tests."""

from __future__ import annotations

import asyncio
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

T = TypeVar("T")


async def run_blocking_with_heartbeat(
    fn: Callable[[], T],
    *,
    heartbeat: Callable[[str], None],
    detail: str,
    interval_s: float = 30.0,
) -> T:
    """Run blocking work in a thread and defer cancellation until it quiesces."""
    future = asyncio.create_task(asyncio.to_thread(fn))
    shielded = asyncio.shield(future)
    pending_cancel: asyncio.CancelledError | None = None
    current_task = asyncio.current_task()

    while True:
        try:
            done, _ = await asyncio.wait({shielded}, timeout=interval_s)
        except asyncio.CancelledError as exc:
            if pending_cancel is None:
                pending_cancel = exc
            if current_task is not None:
                current_task.uncancel()
            heartbeat(detail)
            continue

        heartbeat(detail)
        if shielded in done:
            break

    if pending_cancel is not None:
        try:
            shielded.result()
        except BaseException:
            pass
        raise pending_cancel

    return shielded.result()


def attempt_work_dir(work_dir_base: str, upload_record_id: str, *, attempt: int) -> Path:
    """Return the work directory isolated to one Temporal activity attempt."""
    return Path(work_dir_base) / upload_record_id / f"attempt-{attempt}"


def cleanup_attempt_work_dir(work_dir: Path) -> None:
    """Remove only one attempt's filesystem state."""
    shutil.rmtree(work_dir, ignore_errors=True)
