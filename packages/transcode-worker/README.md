# Transcode Worker

Temporal worker that transcodes media files into multiple formats and resolutions for adaptive streaming (HLS).

## Overview

This worker downloads media from the ingest bucket, transcodes it into various quality levels using ffmpeg, and uploads the results to the public bucket for streaming.

## Required Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `IDENTITY` | Unique identifier for this worker instance | Yes |
| `TEMPORAL_ADDRESS` | Temporal server address | Yes |
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` | Max concurrent activity tasks (CPU path only; ignored when `TRANSCODE_HW_ACCEL=ama:*`) | Yes |
| `SENTRY_DSN` | Sentry error tracking DSN | Yes |

### Concurrency on the AMA hardware path

When `TRANSCODE_HW_ACCEL=ama:<n>` selects an MA35D device, the worker stops
counting jobs and instead admits work against a per-device **dual-constraint
budget**. The MA35D's encoder hard-fails (XRM `Insufficient resources available
for allocation`) when **either** of two resources is exceeded, so each job is
charged on both axes and admitted only when **both** fit:

- **Sessions** — the count of concurrent on-device `h264_ama` encoder contexts.
  Each HLS rendition is one session, so a single ladder already opens **3–4**
  (4K = 4, 1080p = 3, 720p = 2, 480p = 1; audio-only = 0). This is the *primary*
  binding constraint — a single big ladder fits, but two small jobs (6–8
  sessions, low pixels) exhaust the encoder. Bounded by `AMA_MAX_SESSIONS`.
- **Pixels** — aggregate encode throughput in **1080p60-equivalent units**,
  weighted by output area (4K rung = 4× a 1080p rung) and frame rate (60fps ≈ 2×
  the load of 30fps; source fps from the probe). A job's pixel cost is the *max*
  of its encode-ladder and source-decode load (so the decoder is bounded too — a
  between-tier source like 1440p decodes more than its ladder encodes). Bounded
  by `AMA_ENCODE_BUDGET`.

> **2026-06-24 incident:** the original budget tracked pixels only. The device's
> real limit is the **session count** — packing >1 ladder per device exhausted
> the encoder and ~50% of transcodes hard-failed. The session axis is the fix;
> `AMA_MAX_CONCURRENT` is pinned to `1` in the manifest until the true per-device
> session limit is measured on hardware, then it can be raised with the session
> budget keeping the device safe.

A job that exceeds a whole budget dimension runs **alone** once the device is
idle (identical to the proven one-job-per-pod behavior), so it can never
deadlock.

#### Single vs. double density (why the default is 6)

The MA35D's per-device encoder capacity depends on the **codec**, which AMD calls
encoder *density*:

- **Single density** — any combination of AVC (H.264), HEVC, or AV1 Type-2
  encoders. ~`8x1080p60` per device.
- **Double density** — the above **plus** the dedicated AV1 Type-1 encoder
  block, which roughly doubles per-device stream counts (e.g. ~`16x1080p60`).

Density is selected *implicitly* by which encoder you run — there is no flag.
**We emit H.264 (`h264_ama` = AVC), so we are always in single density**; the
double-density numbers require AV1 Type-1 and do not apply to us. The default
`AMA_ENCODE_BUDGET=6` is therefore measured against the **single-density**
ceiling (~8 units/device) and stays safely under it — roughly one 4K-source
ladder's worth, i.e. about today's proven single-job load. If we ever add an
AV1 output rendition we could move into double density and raise the budget
accordingly (after validating on-device).

This is enforced by a weighted semaphore the transcode activity acquires before
launching ffmpeg, plus a Temporal custom slot supplier that caps how many jobs
the pod pulls and stops polling when the device is saturated (so a busy pod
leaves surplus work on the queue for idle pods).

#### Thumbnail extraction on AMA (`AMA_HW_THUMBNAILS`)

`createThumbnails` runs on the same queue and normally software-decodes the whole
source to sample ~100 JPEG frames — a meaningful CPU cost. With
`AMA_HW_THUMBNAILS=true`, on an AMA pod it instead hardware-decodes the source and
JPEG-encodes on the device (`*_ama` decoder → `jpeg_ama`), moving that work off the
host CPU. It only engages when a hardware decoder exists for the source codec
(otherwise it falls back to software), and **it's opt-in/off by default** because
the exact decode→`jpeg_ama` graph still needs validating on real hardware.

Thumbnail jobs draw on the **same** dual-constraint budget: **1 `jpeg_ama`
session + the source-decode pixels**. Only ≤4K sources take the hardware path —
the AMA decoder tops out at 4K.

| Variable | Description | Required |
|----------|-------------|----------|
| `TRANSCODE_HW_ACCEL` | `ama:<n>` to use MA35D device `n`; unset/`none` for the libx264 CPU path | No |
| `AMA_MAX_SESSIONS` | Per-device encoder-session budget (default `4` = one 4K ladder). The binding constraint — measure the true limit before raising | No |
| `AMA_ENCODE_BUDGET` | Per-device pixel budget in 1080p60-equivalent units (default `6`) | No |
| `AMA_MAX_CONCURRENT` | Hard cap on jobs pulled onto one pod at once; the operator master switch (manifest pins `1` pending session validation) | No |
| `AMA_HW_THUMBNAILS` | `true` to hardware-accelerate thumbnail extraction on AMA pods (default off; needs on-device validation) | No |

### S3 Configuration

This worker requires access to **both ingest and public buckets**:

#### Ingest Bucket (source files)

| Variable | Description |
|----------|-------------|
| `S3_INGEST_BUCKET` | S3 bucket name for source media |
| `S3_INGEST_REGION` | S3 region |
| `S3_INGEST_ENDPOINT` | S3 endpoint URL |
| `S3_INGEST_ACCESS_KEY_ID` | S3 access key |
| `S3_INGEST_SECRET_ACCESS_KEY` | S3 secret key |

#### Public Bucket (transcoded output)

| Variable | Description |
|----------|-------------|
| `S3_PUBLIC_BUCKET` | S3 bucket name for public media |
| `S3_PUBLIC_REGION` | S3 region |
| `S3_PUBLIC_ENDPOINT` | S3 endpoint URL |
| `S3_PUBLIC_ACCESS_KEY_ID` | S3 access key |
| `S3_PUBLIC_SECRET_ACCESS_KEY` | S3 secret key |

### System Requirements

- **ffmpeg** must be installed and available in PATH
- Significant disk space for transcoding operations (at least 2-3x the size of source files)
- CPU resources for efficient transcoding (optionally accelerated with [MA35D](https://www.amd.com/en/products/accelerators/alveo/ma35d.html))

## Task Queues

- `TRANSCODE_QUEUE` - Processes video transcoding activities
