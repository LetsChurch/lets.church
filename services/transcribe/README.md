# transcribe

Python Temporal worker for audio transcription. Models load once at startup and
remain resident between activities. The worker uses CUDA when PyTorch reports
it as available and otherwise runs on CPU.

## Pipeline

1. **Download** the source object from the S3 ingest bucket into the current
   Temporal attempt's working directory.
2. **Convert** the source to 16 kHz mono WAV with ffmpeg, then remove the
   downloaded copy.
3. **Transcribe** with
   [faster-whisper](https://github.com/SYSTRAN/faster-whisper), VAD filtering,
   and word timestamps enabled.
4. **Align** each Whisper segment with the bundled English wav2vec2 CTC model
   when alignment is enabled. Segments that cannot be aligned keep their
   Whisper timings, including segments with no words, unsupported text, too
   little audio, or an alignment error.
5. **Diarize** with NVIDIA NeMo's configured speaker encoder. The diarizer
   extracts embeddings from windows within each segment, clusters the
   embeddings, assigns a speaker to each segment, and propagates speakers to
   words.
6. **Re-segment** each contiguous speaker turn with
   [wtpsplit](https://github.com/segment-any-text/wtpsplit). This restores
   sentence punctuation and capitalization, sets paragraph boundaries, and
   preserves word timings. A speaker turn keeps its original segments if it has
   no usable words or the sentence model cannot produce a usable result.
7. **Serialize** the final segments as WebVTT, camel-case JSON, and plain text.
   WebVTT cues follow sentence boundaries and split long sentences at word
   boundaries. Plain text separates paragraphs with blank lines.
8. **Publish** all three files to the S3 public bucket:
   - `{uploadRecordId}/transcript.vtt` (`text/vtt`)
   - `{uploadRecordId}/transcript.json` (`application/json`)
   - `{uploadRecordId}/transcript.txt` (`text/plain; charset=utf-8`)
9. **Complete** the upload record through the background Temporal workflow and
   return the VTT key as `transcriptKey`, the JSON key as
   `transcriptJsonKey`, and the text key in `additionalKeys`.

The ingest bucket is read-only for this activity. The original source object
remains there, while transcript artifacts are written to the public bucket.
Progress, start, and completion updates use signal-with-start on
`updateUploadRecordWorkflow` in the `background` Temporal queue. The Python
worker does not write to the database directly.

## Activity lifecycle

Each Temporal attempt writes under
`{TRANSCRIBE_WORKING_DIRECTORY}/{uploadRecordId}/attempt-{attempt}`. If
cancellation arrives while native blocking work is running, the activity keeps
heartbeating until that work has stopped, then raises the cancellation. Final
cleanup removes only the current attempt directory, after its blocking work has
stopped, so retries cannot delete one another's files.

## Output JSON shape

`originalStart` and `originalEnd` are present when CTC alignment replaced a
Whisper timing. Speaker embedding arrays are abbreviated in this example.

```json
{
  "language": "en",
  "duration": 1234.5,
  "text": "Hello and welcome.",
  "speakerEmbeddings": {
    "SPEAKER_00": [0.0123, -0.0456]
  },
  "segments": [
    {
      "start": 0.12,
      "end": 4.87,
      "originalStart": 0.14,
      "originalEnd": 4.91,
      "text": "Hello and welcome.",
      "speaker": "SPEAKER_00",
      "paragraphIdx": 0,
      "isParagraphStart": true,
      "words": [
        {
          "word": "Hello",
          "start": 0.12,
          "end": 0.41,
          "originalStart": 0.14,
          "originalEnd": 0.44,
          "probability": 0.98,
          "speaker": "SPEAKER_00"
        }
      ]
    }
  ]
}
```

## Environment

Variables marked required are read without a default by each activity.
Endpoint overrides are optional; leave them unset to use the AWS S3 endpoint.

| Var                                       | Required | Default                                       | Purpose                                                        |
| ----------------------------------------- | -------: | --------------------------------------------- | -------------------------------------------------------------- |
| `TEMPORAL_ADDRESS`                        |       No | `localhost:7233`                              | Temporal frontend                                              |
| `TRANSCRIBE_TASK_QUEUE`                   |       No | `transcribe`                                  | Queue the worker polls                                         |
| `IDENTITY`                                |       No | `transcribe`                                  | Worker identity in Temporal                                    |
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` |       No | `1`                                           | Maximum concurrent activities                                  |
| `WHISPER_MODEL`                           |       No | `base`                                        | faster-whisper model                                           |
| `WTPSPLIT_MODEL`                          |       No | `sat-12l-sm`                                  | wtpsplit SaT model                                             |
| `TITANET_MODEL`                           |       No | `nvidia/speakerverification_en_titanet_large` | NeMo speaker encoder                                           |
| `ALIGN_ENABLED`                           |       No | `true`                                        | Enable CTC forced alignment; `0`, `false`, or `no` disables it |
| `TRANSCRIBE_WORKING_DIRECTORY`            |       No | `/data/transcribe`                            | Root for attempt-specific scratch directories                  |
| `WTPSPLIT_SENTENCE_THRESHOLD`             |       No | `0.4`                                         | Sentence-boundary threshold                                    |
| `WTPSPLIT_PARAGRAPH_THRESHOLD`            |       No | `0.5`                                         | Paragraph-boundary threshold                                   |
| `PARAGRAPH_TARGET_CHARS`                  |       No | `200`                                         | Soft minimum paragraph length; `0` disables paragraph merging  |
| `DIARIZATION_WINDOW_SIZE`                 |       No | `2.0`                                         | Speaker-embedding window length in seconds                     |
| `DIARIZATION_HOP`                         |       No | `1.0`                                         | Seconds between speaker-embedding windows                      |
| `DIARIZATION_MIN_WINDOW_SIZE`             |       No | `1.0`                                         | Minimum window length in seconds                               |
| `DIARIZATION_MAX_SPEAKERS`                |       No | `8`                                           | Maximum clusters considered during automatic speaker selection |
| `DIARIZATION_NUM_SPEAKERS`                |       No | unset                                         | Fixed speaker count; unset selects the count automatically     |
| `DIARIZATION_DISTANCE_THRESHOLD`          |       No | `0.8`                                         | Agglomerative-clustering distance threshold                    |
| `DIARIZATION_MIN_RELIABLE_SECS`           |       No | `1.5`                                         | Minimum duration for a reliable segment embedding              |
| `DIARIZATION_MIN_TOTAL_SECS`              |       No | `3.0`                                         | Minimum total duration for a speaker cluster                   |
| `S3_INGEST_ENDPOINT`                      |       No | unset                                         | Custom ingest S3 endpoint                                      |
| `S3_INGEST_BUCKET`                        |      Yes | none                                          | Bucket containing the source object                            |
| `S3_INGEST_ACCESS_KEY_ID`                 |      Yes | none                                          | Credential identifier for ingest reads                         |
| `S3_INGEST_SECRET_ACCESS_KEY`             |      Yes | none                                          | Credential secret for ingest reads                             |
| `S3_PUBLIC_ENDPOINT`                      |       No | unset                                         | Custom public S3 endpoint                                      |
| `S3_PUBLIC_BUCKET`                        |      Yes | none                                          | Bucket receiving transcript artifacts                          |
| `S3_PUBLIC_ACCESS_KEY_ID`                 |      Yes | none                                          | Credential identifier for public writes                        |
| `S3_PUBLIC_SECRET_ACCESS_KEY`             |      Yes | none                                          | Credential secret for public writes                            |

The worker uses CUDA with float16 model computation when it is available.
Without CUDA it uses CPU, with int8 faster-whisper computation. CTC alignment,
diarization, and sentence segmentation use the same CPU/CUDA selection. The
worker does not select MPS.

## Run locally

From the repository root:

```bash
uv run --project services/transcribe python -m src.worker
```

## Run in Docker

```bash
docker build --target transcribe-worker -t transcribe .
docker run --rm --env-file .env transcribe
```

Add `--gpus all` to `docker run` when the host has the NVIDIA container runtime
and a compatible GPU.
