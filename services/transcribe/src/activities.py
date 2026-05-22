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

from .audio import convert_to_wav, load_audio
from .diarization import assign_word_speakers
from .models import get_model_manager
from .segmentation import process_speaker_segments
from .storage import get_s3_client, update_upload_record
from .vtt import segments_to_plaintext, segments_to_vtt

logger = logging.getLogger(__name__)


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
    work_dir = Path(work_dir_base) / upload_record_id
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
        activity.heartbeat("downloading media")
        ingest_s3.download_file(s3_ingest_bucket, s3_upload_key, str(download_path))
        size_mb = download_path.stat().st_size / (1024 * 1024)
        activity.logger.info(f"downloaded {size_mb:.2f} MB")
        await progress.update(0.05)

        activity.heartbeat("converting to wav")
        convert_to_wav(download_path, wav_path)
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
            segments.append(
                {
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": seg.text.strip(),
                    "words": words,
                }
            )
            frac = min(seg.end / duration, 1.0)
            await progress.update(round(0.15 + frac * 0.40, 4))

        await progress.update(0.55, force=True)
        activity.logger.info(
            f"transcription done: language={info.language} segments={len(segments)} "
            f"duration={info.duration:.2f}s"
        )

        # 2. Diarize with titanet (speaker labels + speaker vectors).
        activity.heartbeat("diarizing")
        audio = load_audio(str(wav_path))
        per_segment_labels, speaker_vectors = models.diarizer.diarize(audio, segments)
        for seg, label in zip(segments, per_segment_labels, strict=True):
            seg["speaker"] = label
        assign_word_speakers(segments)
        await progress.update(0.75, force=True)
        activity.logger.info(
            f"diarization done: speakers={len(speaker_vectors)} ({sorted(speaker_vectors.keys())})"
        )

        # 3. Re-segment + restore terminal punctuation via wtpsplit per speaker turn.
        activity.heartbeat("segmenting sentences")
        before = len(segments)
        segments = process_speaker_segments(segments, models.sat, threshold=0.4)
        paragraph_count = sum(1 for s in segments if s.get("is_paragraph_start"))
        activity.logger.info(
            f"segmentation done: segments {before} -> {len(segments)}, paragraphs={paragraph_count}"
        )
        await progress.update(0.88, force=True)

        # 4. Build VTT (one cue per paragraph) + plaintext (\\n\\n between paragraphs).
        vtt_text = segments_to_vtt(segments)
        plain_text = segments_to_plaintext(segments)

        # 5. Build whisper-shaped JSON. Extra fields (speaker, paragraph_idx,
        # is_paragraph_start, top-level speaker_embeddings) ride along; the TS
        # Zod schema strips unknowns in strip mode.
        whisper_segments: list[dict[str, Any]] = []
        for idx, seg in enumerate(segments):
            whisper_segments.append(
                {
                    "id": idx,
                    "start": float(seg.get("start", 0.0)),
                    "end": float(seg.get("end", 0.0)),
                    "text": str(seg.get("text", "")),
                    "tokens": [],
                    "temperature": 0.0,
                    "avg_logprob": 0.0,
                    "compression_ratio": 0.0,
                    "no_speech_prob": 0.0,
                    "speaker": seg.get("speaker"),
                    "paragraph_idx": seg.get("paragraph_idx"),
                    "is_paragraph_start": seg.get("is_paragraph_start"),
                    "words": [
                        {
                            "start": float(w["start"]),
                            "end": float(w["end"]),
                            "word": str(w["word"]),
                            "probability": float(w.get("probability", 1.0)),
                            "speaker": w.get("speaker"),
                        }
                        for w in seg.get("words", [])
                    ],
                }
            )
        whisper_json = {
            "text": plain_text,
            "language": info.language or "en",
            "duration": info.duration,
            "segments": whisper_segments,
            "speaker_embeddings": speaker_vectors,
        }

        vtt_path = work_dir / "transcript.vtt"
        json_path = work_dir / "transcript.original.json"
        txt_path = work_dir / "transcript.txt"
        vtt_path.write_text(vtt_text)
        json_path.write_text(json.dumps(whisper_json))
        txt_path.write_text(plain_text)

        # 6. Upload artifacts to the public bucket (matches the TS transcribe
        # activity — these need to be served to the front-end). The original
        # ingest object stays where it was; we only write transcripts to public.
        activity.heartbeat("uploading transcript")
        transcript_key = f"{upload_record_id}/transcript.vtt"
        transcript_json_key = f"{upload_record_id}/transcript.original.json"
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
        if work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
