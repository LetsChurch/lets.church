# transcribe

Python Temporal worker for audio transcription. Loads all models once at
startup and keeps them resident (in GPU memory if CUDA is available) so each
activity invocation skips the cold-start cost.

## Pipeline

1. **Download** the upload from the S3 ingest bucket.
2. **Convert** to 16 kHz mono WAV via ffmpeg.
3. **Transcribe** with [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
   using `vad_filter=True` and `word_timestamps=True`. Words come straight
   from whisper — no separate wav2vec2 alignment pass.
4. **Diarize** with NVIDIA NeMo's
   [titanet_large](https://huggingface.co/nvidia/speakerverification_en_titanet_large)
   speaker encoder. Each whisper segment is sliced into overlapping 1.5 s
   windows, an embedding is extracted per window, and agglomerative clustering
   (cosine distance) assigns labels. Speakers are propagated to words.
5. **Re-segment** by speaker turn with
   [wtpsplit](https://github.com/segment-any-text/wtpsplit) (`sat-12l-sm`) to
   recover punctuation, capitalization, and paragraph boundaries while keeping
   per-word timings.
6. **Upload** the final JSON to the ingest bucket as
   `{uploadRecordId}/transcript.json`.

Progress is streamed back through the `updateUploadRecordWorkflow` on the
`background` Temporal queue (signal-with-start) — the same channel the
TypeScript activities use. This worker never touches the database directly.

## Output JSON shape

```json
{
  "language": "en",
  "duration": 1234.5,
  "speaker_embeddings": {
    "SPEAKER_00": [/* 192-dim L2-normalized titanet centroid */],
    "SPEAKER_01": [/* ... */]
  },
  "segments": [
    {
      "start": 0.12,
      "end": 4.87,
      "text": "Hello and welcome.",
      "speaker": "SPEAKER_00",
      "paragraph_idx": 0,
      "is_paragraph_start": true,
      "words": [
        {"word": "Hello", "start": 0.12, "end": 0.41, "probability": 0.98, "speaker": "SPEAKER_00"}
      ]
    }
  ]
}
```

## Environment

| Var | Default | Purpose |
|---|---|---|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal frontend |
| `TRANSCRIBE_TASK_QUEUE` | `transcribe` | Queue the worker polls |
| `IDENTITY` | `transcribe` | Worker identity in Temporal |
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` | `1` | Concurrent activities |
| `WHISPER_MODEL` | `base` | faster-whisper size (`tiny`, `base`, `small`, `medium`, `large-v3`, …) |
| `WTPSPLIT_MODEL` | `sat-12l-sm` | wtpsplit SaT variant |
| `TITANET_MODEL` | `nvidia/speakerverification_en_titanet_large` | NeMo speaker encoder |
| `TRANSCRIBE_WORKING_DIRECTORY` | `/data/transcribe` | Per-activity scratch dir |
| `S3_INGEST_ENDPOINT` | — | Ingest bucket endpoint (omit for AWS) |
| `S3_INGEST_BUCKET` | — | Ingest bucket name |
| `S3_INGEST_ACCESS_KEY_ID` / `S3_INGEST_SECRET_ACCESS_KEY` | — | Ingest creds |

## Run locally

```bash
uv run python -m src.worker
```

## Run in Docker

```bash
docker build -t transcribe services/transcribe
docker run --rm --gpus all --env-file .env transcribe
```
