"""Cancellation and attempt-isolation tests for the transcription activity."""

from __future__ import annotations

import asyncio
import threading
from types import SimpleNamespace

import pytest

from src import activities


def test_blocking_with_heartbeat_returns_result(monkeypatch):
    heartbeats: list[str] = []
    monkeypatch.setattr(activities.activity, "heartbeat", heartbeats.append)

    result = asyncio.run(
        activities._blocking_with_heartbeat(
            lambda: "finished", detail="normal work", interval_s=0.01
        )
    )

    assert result == "finished"
    assert heartbeats == ["normal work"]


def test_blocking_with_heartbeat_preserves_blocking_exception(monkeypatch):
    class BlockingFailureError(Exception):
        pass

    monkeypatch.setattr(activities.activity, "heartbeat", lambda _detail: None)

    def fail():
        raise BlockingFailureError("native failure")

    with pytest.raises(BlockingFailureError, match="native failure"):
        asyncio.run(
            activities._blocking_with_heartbeat(fail, detail="failing work", interval_s=0.01)
        )


def test_cancellation_waits_for_blocking_work_before_cleanup(monkeypatch):
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

    monkeypatch.setattr(activities.activity, "heartbeat", heartbeat)

    def blocking_work():
        started.set()
        release.wait()
        completed.set()

    async def scenario():
        async def run_with_cleanup():
            try:
                await activities._blocking_with_heartbeat(
                    blocking_work, detail="blocked work", interval_s=0.01
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


def test_repeated_cancellation_is_drained_without_finishing_early(monkeypatch):
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

    monkeypatch.setattr(activities.activity, "heartbeat", heartbeat)

    def blocking_work():
        started.set()
        release.wait()

    async def scenario():
        nonlocal cancellation_count
        task = asyncio.create_task(
            activities._blocking_with_heartbeat(
                blocking_work, detail="blocked work", interval_s=0.01
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


def test_attempt_work_directories_are_distinct_and_cleanup_is_isolated(monkeypatch, tmp_path):
    contexts = iter([SimpleNamespace(attempt=1), SimpleNamespace(attempt=2)])
    monkeypatch.setattr(activities.activity, "info", lambda: next(contexts))

    first = activities._attempt_work_dir(str(tmp_path), "upload-123")
    second = activities._attempt_work_dir(str(tmp_path), "upload-123")

    assert first != second
    assert first.parent == second.parent
    first.mkdir(parents=True)
    second.mkdir()
    (first / "marker").write_text("first")
    second_marker = second / "marker"
    second_marker.write_text("second")

    activities._cleanup_attempt_work_dir(first)

    assert not first.exists()
    assert second_marker.read_text() == "second"
