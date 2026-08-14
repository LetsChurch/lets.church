"""Temporal activity for the transcribe worker.

Pipeline:
  1. Download upload from S3 ingest.
  2. Convert to 16 kHz mono WAV.
  3. Transcribe with faster-whisper (word_timestamps + VAD).
  4. Diarize with titanet (speaker labels + 192-dim speaker vectors).
  5. Re-segment + restore terminal punctuation with wtpsplit per speaker turn.
     Paragraph boundaries come from wtpsplit's `do_paragraph_segmentation`.
  6. Emit VTT with one cue per sentence (long sentences split at word
     boundaries under a duration ceiling), plaintext with `\\n\\n` between
     paragraphs, and a whisper-schema-compatible JSON (with speaker_embeddings).

Progress is streamed through the background queue's `updateUploadRecordWorkflow`
signal — no direct DB writes from this worker.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from temporalio import activity

from .alignment import align_segments
from .audio import convert_to_wav, load_audio
from .diarization import assign_word_speakers
from .models import get_model_manager
from .pipeline import build_transcript_json, iter_whisper_segments
from .segmentation import process_speaker_segments
from .storage import get_s3_client, update_upload_record
from .vtt import segments_to_plaintext, segments_to_vtt

logger = logging.getLogger(__name__)


async def _blocking_with_heartbeat(fn, *, detail: str, interval_s: float = 30.0):
    """Run a blocking, zero-arg `fn` in a worker thread while heartbeating.

    Cancelling this coroutine cannot stop an already-running native thread.
    Instead, cancellation is recorded and temporarily cleared while the same
    shielded future is drained. Heartbeats continue during that drain, and the
    cancellation is re-raised only after the blocking work has quiesced.
    """
    fut = asyncio.create_task(asyncio.to_thread(fn))
    shielded = asyncio.shield(fut)
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
            activity.heartbeat(detail)
            continue

        activity.heartbeat(detail)
        if shielded in done:
            break

    if pending_cancel is not None:
        try:
            shielded.result()
        except BaseException:
            pass
        raise pending_cancel

    return shielded.result()


def _attempt_work_dir(work_dir_base: str, upload_record_id: str) -> Path:
    """Return the upload work directory isolated to this Temporal attempt."""
    attempt = activity.info().attempt
    return Path(work_dir_base) / upload_record_id / f"attempt-{attempt}"


def _cleanup_attempt_work_dir(work_dir: Path) -> None:
    """Remove only one attempt's filesystem state."""
    shutil.rmtree(work_dir, ignore_errors=True)


class ThrottledProgressUpdater:
    """Coalesces progress signals so we don't spam Temporal."""

    def __init__(self, upload_record_id: str, throttle_ms: float = 2500):
        self.upload_record_id = upload_record_id
        self.throttle_s = throttle_ms / 1000.0
        self._last_sent_at = 0.0
        self._last_value: float | None = None
        self._lock = asyncio.Lock()

    async def update(self, progress: float, *, force: bool = False) -> None:
        async with self._lock:
            now = time.monotonic()
            if not force:
                if self._last_value is not None and progress == self._last_value:
                    return
                if now - self._last_sent_at < self.throttle_s:
                    return
            self._last_sent_at = now
            self._last_value = progress

        try:
            await update_upload_record(self.upload_record_id, {"transcribingProgress": progress})
        except Exception as exc:
            activity.logger.warning(f"Failed to send progress update {progress}: {exc}")


@activity.defn
async def transcribe(upload_record_id: str, s3_upload_key: str) -> dict[str, Any]:
    """Transcribe + diarize + wtpsplit-segment one upload; emit VTT, JSON, plaintext."""
    activity.logger.info(f"transcribe start: upload={upload_record_id} key={s3_upload_key}")

    work_dir_base = os.environ.get("TRANSCRIBE_WORKING_DIRECTORY", "/data/transcribe")

    # Segmentation knobs. `threshold` is wtpsplit's sentence-boundary
    # threshold; `paragraph_threshold` is the paragraph-boundary one
    # (set explicitly so a future wtpsplit default change doesn't shift
    # output silently). `target_chars` post-merges paragraphs within a
    # speaker group to at least that many characters — wtpsplit's
    # paragraph signal rarely fires on continuous ASR transcripts so
    # this is the knob that actually controls paragraph size for the
    # audience-facing transcript view. 0 disables merging.
    sentence_threshold = float(os.getenv("WTPSPLIT_SENTENCE_THRESHOLD", "0.4"))
    paragraph_threshold = float(os.getenv("WTPSPLIT_PARAGRAPH_THRESHOLD", "0.5"))
    paragraph_target_chars = int(os.getenv("PARAGRAPH_TARGET_CHARS", "200"))

    s3_ingest_endpoint = os.environ.get("S3_INGEST_ENDPOINT")
    s3_ingest_bucket = os.environ["S3_INGEST_BUCKET"]
    s3_ingest_key = os.environ["S3_INGEST_ACCESS_KEY_ID"]
    s3_ingest_secret = os.environ["S3_INGEST_SECRET_ACCESS_KEY"]

    s3_public_endpoint = os.environ.get("S3_PUBLIC_ENDPOINT")
    s3_public_bucket = os.environ["S3_PUBLIC_BUCKET"]
    s3_public_key = os.environ["S3_PUBLIC_ACCESS_KEY_ID"]
    s3_public_secret = os.environ["S3_PUBLIC_SECRET_ACCESS_KEY"]

    ingest_s3 = get_s3_client(s3_ingest_endpoint, s3_ingest_key, s3_ingest_secret)
    public_s3 = get_s3_client(s3_public_endpoint, s3_public_key, s3_public_secret)
    progress = ThrottledProgressUpdater(upload_record_id)

    models = get_model_manager()
    work_dir = _attempt_work_dir(work_dir_base, upload_record_id)
    download_path = work_dir / "download"
    wav_path = work_dir / "audio.wav"

    # Mark transcribing started. ISO 8601 strings are coerced back to Date by
    # the TS update-upload-record activity (`coerceDates`).
    await update_upload_record(
        upload_record_id,
        {"transcribingStartedAt": datetime.now(UTC).isoformat()},
    )

    try:
        work_dir.mkdir(parents=True, exist_ok=True)
        await _blocking_with_heartbeat(
            lambda: ingest_s3.download_file(s3_ingest_bucket, s3_upload_key, str(download_path)),
            detail="downloading media",
        )
        size_mb = download_path.stat().st_size / (1024 * 1024)
        activity.logger.info(f"downloaded {size_mb:.2f} MB")
        await progress.update(0.05)

        await _blocking_with_heartbeat(
            lambda: convert_to_wav(download_path, wav_path),
            detail="converting to wav",
        )
        download_path.unlink(missing_ok=True)
        await progress.update(0.10)

        # 1. Transcribe with word-level timestamps and VAD filtering.
        activity.heartbeat("transcribing")
        await progress.update(0.15)
        segments_iter, info = models.whisper.transcribe(
            str(wav_path),
            language="en",
            beam_size=5,
            vad_filter=True,
            word_timestamps=True,
        )

        segments: list[dict[str, Any]] = []
        duration = info.duration or 1.0
        # iter_whisper_segments yields each segment as a dict; we accumulate
        # while emitting progress so the worker doesn't block on a final
        # `await` after the entire (potentially long) transcription completes.
        for seg in iter_whisper_segments(segments_iter):
            segments.append(seg)
            frac = min(seg["end"] / duration, 1.0)
            # faster-whisper transcribes lazily as this iterator is drained, so
            # each `next()` is real work — heartbeat per segment (unlike the
            # throttled progress signal, this keeps the 600s timeout at bay for
            # multi-hour audio).
            activity.heartbeat(f"transcribing {frac:.0%}")
            await progress.update(round(0.15 + frac * 0.40, 4))

        await progress.update(0.55, force=True)
        activity.logger.info(
            f"transcription done: language={info.language} segments={len(segments)} "
            f"duration={info.duration:.2f}s"
        )

        # Load the audio once for the GPU-side stages below (alignment + diarization).
        # ffmpeg decodes the entire (multi-hour) file here, so heartbeat through it.
        audio = await _blocking_with_heartbeat(
            lambda: load_audio(str(wav_path)),
            detail="loading audio",
        )

        # 2. CTC forced alignment refines whisper's word_timestamps to true
        # frame ranges (much tighter for word-level highlighting). Skipped via
        # ALIGN_ENABLED=false; falls back per-segment on internal errors.
        if models.align is not None:
            segments = await _blocking_with_heartbeat(
                lambda: align_segments(audio, segments, models.align),
                detail="aligning",
            )
            activity.logger.info("alignment done")
        await progress.update(0.65, force=True)

        # 3. Diarize with titanet (speaker labels + speaker vectors).
        per_segment_labels, speaker_vectors = await _blocking_with_heartbeat(
            lambda: models.diarizer.diarize(audio, segments),
            detail="diarizing",
        )
        for seg, label in zip(segments, per_segment_labels, strict=True):
            seg["speaker"] = label
        assign_word_speakers(segments)
        await progress.update(0.80, force=True)
        activity.logger.info(
            f"diarization done: speakers={len(speaker_vectors)} ({sorted(speaker_vectors.keys())})"
        )

        # 4. Re-segment + restore terminal punctuation via wtpsplit per speaker turn.
        before = len(segments)
        segments = await _blocking_with_heartbeat(
            lambda: process_speaker_segments(
                segments,
                models.sat,
                threshold=sentence_threshold,
                paragraph_threshold=paragraph_threshold,
                paragraph_target_chars=paragraph_target_chars,
            ),
            detail="segmenting sentences",
        )
        paragraph_count = sum(1 for s in segments if s.get("is_paragraph_start"))
        activity.logger.info(
            f"segmentation done: segments {before} -> {len(segments)}, paragraphs={paragraph_count}"
        )
        await progress.update(0.90, force=True)

        # 4. Build VTT (one cue per paragraph) + plaintext (\\n\\n between paragraphs).
        vtt_text = segments_to_vtt(segments)
        plain_text = segments_to_plaintext(segments)

        # 5. Build the transcript JSON via the shared camelCase serializer
        # (`src/pipeline.py`). Internal Python dicts stay snake_case; only
        # this final shape goes to JS consumers.
        transcript_json = build_transcript_json(
            segments=segments,
            speaker_vectors=speaker_vectors,
            language=info.language or "en",
            duration=info.duration,
            plain_text=plain_text,
        )

        vtt_path = work_dir / "transcript.vtt"
        json_path = work_dir / "transcript.json"
        txt_path = work_dir / "transcript.txt"
        vtt_path.write_text(vtt_text)
        json_path.write_text(json.dumps(transcript_json))
        txt_path.write_text(plain_text)

        # 6. Upload artifacts to the public bucket (matches the TS transcribe
        # activity — these need to be served to the front-end). The original
        # ingest object stays where it was; we only write transcripts to public.
        activity.heartbeat("uploading transcript")
        transcript_key = f"{upload_record_id}/transcript.vtt"
        transcript_json_key = f"{upload_record_id}/transcript.json"
        transcript_txt_key = f"{upload_record_id}/transcript.txt"
        public_s3.upload_file(
            str(vtt_path),
            s3_public_bucket,
            transcript_key,
            ExtraArgs={"ContentType": "text/vtt"},
        )
        public_s3.upload_file(
            str(json_path),
            s3_public_bucket,
            transcript_json_key,
            ExtraArgs={"ContentType": "application/json"},
        )
        public_s3.upload_file(
            str(txt_path),
            s3_public_bucket,
            transcript_txt_key,
            ExtraArgs={"ContentType": "text/plain; charset=utf-8"},
        )
        activity.logger.info(
            f"uploaded: {transcript_key}, {transcript_json_key}, {transcript_txt_key}"
        )
        await progress.update(1.0, force=True)
        await update_upload_record(
            upload_record_id,
            {"transcribingFinishedAt": datetime.now(UTC).isoformat()},
        )

        return {
            "transcriptKey": transcript_key,
            "transcriptJsonKey": transcript_json_key,
            "additionalKeys": [transcript_txt_key],
        }
    except Exception:
        activity.logger.exception("transcribe failed")
        # Reset both timestamps so the upload doesn't look like it succeeded.
        try:
            await update_upload_record(
                upload_record_id,
                {"transcribingStartedAt": None, "transcribingFinishedAt": None},
            )
        except Exception:
            activity.logger.exception("failed to reset transcribing timestamps")
        raise
    finally:
        _cleanup_attempt_work_dir(work_dir)
