# Gateway

A GraphQL gateway service.

> **Matthew 7:13-14 ESV**  
> “Enter by the narrow gate. For the gate is wide and the way is easy that leads to destruction, and those who enter by it are many. [14] For the gate is narrow and the way is hard that leads to life, and those who find it are few.

## Understanding [Temporal] (High Level)

- Workflows can coordinate activities, receive signals, and respond to queries.
- Workflows run in V8 isolates and cannot use any node APIs.
- Activities run in worker processes (standard node process, can use node APIs).
- Workflows should use [Temporal] APIs and coordinate activities, anything that
  produces a side effect should be done in activities. Workflows do not import
  or use activities directly, they are proxied for the purpose of scheduling.
- Only activity types are imported into workflows.
- Clients schedule workflows to run. While workflow functions are passed
  directly to the client, it is never called by the client. It is only used for
  type inference and for getting the name of a workflow for scheduling.
- Workers run workflows and activities. In development, Temporal uses Webpack
  to bundle workflow code for running inside V8 isolates.

## Let's Church Temporal Specifics

- There are three worker processes: background, transcode, and transcribe.
- `background` handles all workflows as well as light weight activities
- `transcode` handles all activities related to transcoding media
- `transcribe` handles all activities related to transcribing media

Splitting transcoding and transcribing activities across multiple workers makes it easy to scale those functions
independently from each other. It also ensures that lighter background activities won't be blocked waiting for larger
activities to finish.

## Worker Environment Variables and Requirements

All workers expect the following environment variables:

- `S3_INGEST_REGION`
- `S3_INGEST_ENDPOINT`
- `S3_INGEST_BUCKET`
- `S3_INGEST_ACCESS_KEY_ID`
- `S3_INGEST_SECRET_ACCESS_KEY`
- `S3_PUBLIC_REGION`
- `S3_PUBLIC_ENDPOINT`
- `S3_PUBLIC_BUCKET`
- `S3_PUBLIC_ACCESS_KEY_ID`
- `S3_PUBLIC_SECRET_ACCESS_KEY`
- `TEMPORAL_ADDRESS`
- `TEMPORAL_SHUTDOWN_GRACE_TIME`
- `IDENTITY` (an arbitrary string to make identitying workers easier in the Temporal UI)

### `background-worker`

- `DATABASE_URL`
- `ELASTICSEARCH_URL`
- `SMTP_URL`

### `transcode-worker`

- `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS`
- `TRANSCODE_HW_ACCEL`, (e.g., `ama`)
- _optional_ `TRANSCODE_WORKING_DIRECTORY`
- _optional_ `THUMBNAILS_WORKING_DIRECTORY`
- _optional_ `PEAKS_WORKING_DIRECTORY`
- _optional_ `PROBE_WORKING_DIRECTORY`
- If running without the container you must ensure that `ffmpeg` and `audiowaveform` are available on `PATH`

### `transcribe-worker`

- `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS`
- `WHISPER_MODEL`
- `WHISPER_EXTRA_ARGS`, (e.g., `--device_index 1`)
- _optional_ `TRANSCRIBE_WORKING_DIRECTORY`
- If running without the container you must ensure that `ffmpeg` and `whisper-ctranslate2` are available on `PATH`

[Temporal]: https://temporal.io 'Less plumbing, more coding'
