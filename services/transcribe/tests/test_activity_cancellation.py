"""Cancellation and attempt-isolation tests for the transcription activity."""

from __future__ import annotations

import asyncio
import threading

import pytest

from src.activity_runtime import (
    attempt_work_dir,
    cleanup_attempt_work_dir,
    run_blocking_with_heartbeat,
)


def test_blocking_with_heartbeat_returns_result():
    heartbeats: list[str] = []

    result = asyncio.run(
        run_blocking_with_heartbeat(
            lambda: "finished",
            heartbeat=heartbeats.append,
            detail="normal work",
            interval_s=0.01,
        )
    )

    assert result == "finished"
    assert heartbeats == ["normal work"]


def test_blocking_with_heartbeat_preserves_blocking_exception():
    class BlockingFailureError(Exception):
        pass

    def fail():
        raise BlockingFailureError("native failure")

    with pytest.raises(BlockingFailureError, match="native failure"):
        asyncio.run(
            run_blocking_with_heartbeat(
                fail,
                heartbeat=lambda _detail: None,
                detail="failing work",
                interval_s=0.01,
            )
        )


def test_cancellation_waits_for_blocking_work_before_cleanup():
    started = threading.Event()
    release = threading.Event()
    completed = threading.Event()
    cleaned_up = threading.Event()
    drain_heartbeats = threading.Event()
    cancellation_requested = threading.Event()
    heartbeat_count = 0

    def heartbeat(_detail: str):
        nonlocal heartbeat_count
        if cancellation_requested.is_set():
            heartbeat_count += 1
            if heartbeat_count >= 2:
                drain_heartbeats.set()

    def blocking_work():
        started.set()
        release.wait()
        completed.set()

    async def scenario():
        async def run_with_cleanup():
            try:
                await run_blocking_with_heartbeat(
                    blocking_work,
                    heartbeat=heartbeat,
                    detail="blocked work",
                    interval_s=0.01,
                )
            finally:
                cleaned_up.set()

        task = asyncio.create_task(run_with_cleanup())
        try:
            assert await asyncio.to_thread(started.wait, 1.0)

            cancellation_requested.set()
            task.cancel()
            assert await asyncio.to_thread(drain_heartbeats.wait, 1.0)
            assert not task.done()
            assert not completed.is_set()
            assert not cleaned_up.is_set()

            release.set()
            with pytest.raises(asyncio.CancelledError):
                await task

            assert completed.is_set()
            assert cleaned_up.is_set()
        finally:
            release.set()

    asyncio.run(scenario())


def test_repeated_cancellation_is_drained_without_finishing_early():
    started = threading.Event()
    release = threading.Event()
    first_cancel_drained = threading.Event()
    second_cancel_drained = threading.Event()
    cancellation_count = 0

    def heartbeat(_detail: str):
        if cancellation_count == 1:
            first_cancel_drained.set()
        elif cancellation_count == 2:
            second_cancel_drained.set()

    def blocking_work():
        started.set()
        release.wait()

    async def scenario():
        nonlocal cancellation_count
        task = asyncio.create_task(
            run_blocking_with_heartbeat(
                blocking_work,
                heartbeat=heartbeat,
                detail="blocked work",
                interval_s=0.01,
            )
        )
        try:
            assert await asyncio.to_thread(started.wait, 1.0)

            cancellation_count = 1
            task.cancel()
            assert await asyncio.to_thread(first_cancel_drained.wait, 1.0)
            assert not task.done()

            cancellation_count = 2
            task.cancel()
            assert await asyncio.to_thread(second_cancel_drained.wait, 1.0)
            assert not task.done()

            release.set()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            release.set()

    asyncio.run(scenario())


def test_attempt_work_directories_are_distinct_and_cleanup_is_isolated(tmp_path):
    first = attempt_work_dir(str(tmp_path), "upload-123", attempt=1)
    second = attempt_work_dir(str(tmp_path), "upload-123", attempt=2)

    assert first != second
    assert first.parent == second.parent
    first.mkdir(parents=True)
    second.mkdir()
    (first / "marker").write_text("first")
    second_marker = second / "marker"
    second_marker.write_text("second")

    cleanup_attempt_work_dir(first)

    assert not first.exists()
    assert second_marker.read_text() == "second"
