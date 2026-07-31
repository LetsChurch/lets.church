# Dev seed data

The dev seed (`just seed`) primes a local stack with a fixed set of channels,
users, uploads, and their media artifacts so the app is immediately usable
after a fresh `just init`. This page documents what's there, how the
LLM-enabled pipeline (paragraphs + summaries + embeddings) is wired up, and
how to add new uploads to the seed.

## What the seed produces

`just seed` is two steps in series:

1. **`just seed-s3`** — rclone-syncs `seed-data/lcdevs3/` into the three
   local minio buckets (`ingest`, `public`, `backup`). The directory tree
   under `seed-data/lcdevs3/letschurch-dev-public/{uploadId}/` becomes the
   public S3 prefix for that upload — including pre-rendered HLS audio
   (`AUDIO.m3u8` + `AUDIO_*.m4s`), thumbnails, peaks, the legacy VTT
   transcript, and (for LLM-enabled uploads) the camelCase `transcript.json`
   produced by the worker pipeline.
2. **`just seed-db`** — runs `packages/web/src/seed/dev.ts` inside the `web`
   container. It inserts users, channels, organizations, uploads, and (for
   uploads listed in `LLM_SEEDED_UPLOAD_IDS`) direct-inserts the LLM data
   from committed snapshot JSONs at `seed-data/llm/{uuid}.json` — no S3
   reads, no OpenRouter calls, end-to-end in ~20 seconds. The JSONs are
   visible inside the web container via the `./seed-data:/seed-data` bind
   mount; they're git-LFS-tracked (`seed-data/llm/*.json` in
   `.gitattributes`) and deliberately live outside `seed-data/lcdevs3/` so
   `seed-s3-public` doesn't waste a sync round-trip uploading them.

## Two seed regimes per upload

- **Legacy uploads** — ship a `transcript.vtt` only. The Transcript tab uses
  the VTT-derived line transcript; no summary, no paragraph embeddings, no
  `lc_media_v1` index entry. **No uploads in the current seed corpus are in
  this regime** — every one has a real `transcript.json` plus a committed
  LLM snapshot. The legacy path is still preserved in case new audio is
  added before its snapshot is generated.
- **LLM-seeded uploads** — ship both `transcript.json` (raw worker output,
  under `seed-data/lcdevs3/letschurch-dev-public/{uploadId}/`) and a
  snapshot of the post-pipeline DB state at `seed-data/llm/{uploadId}.json`
  (paragraphs with embeddings + display/search summaries + summary
  embeddings). The seed direct-inserts from the snapshot and fires an
  `indexDocument('media', …)` to push the unified doc to `lc_media_v1`. No
  LLM calls at seed time — the snapshot _is_ the real LLM output, captured
  once and committed.

The current seed corpus has **27 LLM-seeded uploads**: the 20-part Dorean
Principle audiobook (Foreword → Conclusion + 3 Appendices) plus the 7
Selling Jesus pitch-meeting / supporting videos. All 27 transcripts were
produced with `large-v3` for maximum quality (the run takes ~3 hours of
CPU but is a one-time process; subsequent seeds load from the snapshot
JSONs in milliseconds). The summaries + embeddings on top were produced
by the real workflow against those transcripts
(`openai/gpt-5.6-luna` + `openai/text-embedding-3-small` via OpenRouter),
then snapshotted.

## Refreshing the LLM snapshots

The snapshot JSONs live at `seed-data/llm/{uuid}.json` and are read at seed
time. They are produced from a fresh dev DB that already went through the
real LLM workflow — so to refresh them after a prompt change or a
transcript regen, you need to first put the live-pipeline data into the DB,
then dump it out.

### Narrow refresh: just annotations

If only a single derived layer needs to land in the seed (e.g. you just
added the annotation tables and want to populate them across the existing
LLM-seeded uploads), don't run a full `LIVE_PIPELINE=1` refresh — it'd
re-summarize and re-embed everything you already have. Use the targeted
recipe instead:

```bash
just seed                          # baseline from existing snapshots
just generate-seed-annotations     # runs only annotateTranscript per upload
just dump-llm-seed-data            # capture the new annotations into JSON
# commit refreshed seed-data/llm/*.json
```

The `generate-seed-annotations` recipe shells into the web container and
runs `tsx src/seed/generate-annotations.ts`, which calls
`annotateTranscript(uploadId)` directly (it's a plain async function, no
Temporal runtime needed) for every id in `LLM_SEEDED_UPLOAD_IDS`. ~$0.18
× N uploads in OpenRouter tokens, ~10 minutes wall time for the current
27-upload corpus.

### Narrow refresh: just summaries

The summarize prompt reads the OUTLINE annotations produced by annotate
and emits per-section descriptions alongside the prose summary. When the
summarize prompt changes (e.g. the YouTube-style sections rollout) the
narrow recipe is the same shape as annotations but a step further down
the pipeline:

```bash
just seed                          # baseline from existing snapshots (annotations included)
just generate-seed-summaries       # runs summarizeUpload + embedUpload per upload
just dump-llm-seed-data            # capture the new summaries + sections into JSON
# commit refreshed seed-data/llm/*.json
```

`generate-seed-summaries` calls `summarizeUpload(uploadId, { force: true })`
followed by `embedUpload(uploadId)` for each LLM-seeded upload — both are
plain async functions. `force: true` so the activity's idempotency check
doesn't skip uploads with an existing summary. Sequencing matters: the
recipe assumes OUTLINE annotations already exist in the DB (they do
after `just seed` because the snapshot includes them); if you've just
swapped in a new annotation prompt, run `just generate-seed-annotations`
first so summarize gets the new outlines as input.

### Initial / one-shot regeneration of everything

1. **Regenerate transcripts in bulk** with one model load
   (`services/transcribe/scripts/transcribe_batch.py`). Build a manifest of
   `INPUT<TAB>OUTPUT` pairs (one per upload), then:

   ```bash
   docker compose exec -T transcribe-worker sh -c \
     "cd /app && uv run --no-sync python scripts/transcribe_batch.py \
       --manifest /seed-data/llm/regen-manifest.tsv \
       --whisper-model large-v3"
   ```

   On Apple Silicon CPU (Docker), `large-v3` is roughly 0.6× realtime —
   the full 5.4-hour seed corpus takes about 3 hours wall. `base.en` is
   ~10× faster but visibly mis-attributes names (e.g. "Conley Owens" →
   "Connolly Owens"); use it for prompt iteration, switch to `large-v3`
   for the final snapshot. The `regen-manifest.tsv` is a throwaway — drop
   it after the run.
2. `just seed-s3-public` — push the new transcripts into minio.
3. `LIVE_PIPELINE=1 just truncate && LIVE_PIPELINE=1 just seed-db` —
   `dev.ts` detects the env var and runs the real `annotateTranscript`
   activity followed by `summarizeUploadWorkflow` against the background-
   worker for each upload. Sequencing matters: annotate writes OUTLINE
   annotations, and summarize reads them to produce per-section
   descriptions. ~30–60s × N uploads of OpenRouter time, ~$0.50–0.80 of
   tokens for the current 27-upload corpus (annotate dominates).
4. `just dump-llm-seed-data` — snapshot the freshly-seeded DB into
   `seed-data/llm/` (git-LFS-tracked).
5. Commit the refreshed JSONs (and the new transcripts if regenerated).
6. Subsequent `just seed` runs use the snapshots (fast + free).

## Adding a new LLM-seeded upload

There are two pieces — the artifacts in `seed-data/` and the wiring in the
TS seed script.

### 1. Stage the audio/video artifacts under `seed-data/`

Put the upload's media files under
`seed-data/lcdevs3/letschurch-dev-public/{uploadId}/`. The transcribe-side
of the pipeline only needs an `AUDIO.m3u8` (with its `AUDIO_init.mp4` and
`AUDIO_*.m4s` segments alongside). The simplest way to produce these from a
source audio file is the existing transcode-worker (run a real upload
through the full processMedia workflow once on a dev branch, then commit
the resulting `seed-data/` artifacts).

### 2. Generate `transcript.json`

```bash
just regenerate-seed-transcript <uploadId> [whisper-model]
```

Defaults to `base.en`. Pass `large-v3` for prod-quality at the cost of disk
+ time (`~3 GB` download on first use, then several minutes per hour of
audio on CPU; once cached the subsequent runs are fast):

```bash
just regenerate-seed-transcript 00000000-0000-4000-8000-000000000000 large-v3
```

Mechanics: the `transcribe-worker` container bind-mounts `./seed-data` at
`/seed-data`, so the script reads the upload's `AUDIO.m3u8` directly and
writes `transcript.json` straight back into the repo tree. ffmpeg
re-conversion happens inside the container — there's no host-side audio
reassembly step.

Under the hood the recipe invokes
`services/transcribe/scripts/transcribe_file.py`, which runs the **same
pipeline as the production activity** (whisper → wav2vec2 CTC alignment →
titanet diarization → wtpsplit sentence/paragraph segmentation). The
whisper-iter conversion and the camelCase JSON serializer are shared with
the activity via `services/transcribe/src/pipeline.py`, so the output of
the script is byte-for-byte the same shape the worker writes to S3 in
production.

### 3. Wire the upload into the LLM seed list

Add the uploadId to `packages/web/src/seed/llm-seed.ts`:

```ts
export const LLM_SEEDED_UPLOAD_IDS = [
  '00000000-0000-4000-8000-000000000000',
  // add new IDs here
] as const;
```

Both `dev.ts` (the seed) and `dump-llm-seed-data.ts` (the snapshotter) read
this list, so it's the single source of truth.

### 4. Refresh the snapshot for the new upload

Either regenerate everything (see "Refreshing the LLM snapshots" above), or
do just the new upload: temporarily comment out the other ids in
`LLM_SEEDED_UPLOAD_IDS`, run the live-pipeline path against the new id, dump
it, restore the list.

### 5. Verify

```bash
just truncate && just seed
```

The `seed-db` step will log a `[seed]` line for each upload as it stores
paragraphs and runs the summary workflow. After it returns:

```bash
# DB shape
docker compose exec postgres psql -U letschurch -d letschurch -c "
  select id, length(summary), jsonb_array_length(summary_embedding),
         (select count(*) from transcript_paragraph where upload_record_id = ur.id) as paragraphs
  from upload_record ur
  where ur.id in ('<uploadId>');
"

# ES shape
docker compose exec elasticsearch curl -s \
  'http://localhost:9200/lc_media_v1/_doc/<uploadId>?_source_excludes=*Embedding,paragraphs.embedding,paragraphs'
```

Both should return the populated row + doc.

## Cost & timing budget

Snapshot-based seed (the default flow):

- `~20 s` wall time for `just seed-db` end to end (27 snapshot loads + 27
  ES index calls). No LLM calls, no OpenRouter charges.
- Snapshot JSON storage: ~94 MB in the repo (mostly 1536-dim embeddings;
  each 128-paragraph upload ≈ 3–6 MB).

Refreshing the snapshots (`just dump-llm-seed-data` against a freshly
live-pipeline-seeded DB):

- 1 chat completion per upload against `OPENROUTER_ANNOTATE_MODEL` (default
  `openai/gpt-5.6-luna`) — ~$0.01–0.03 per upload. Annotate echoes the
  transcript back with inline section headings and scripture/keyword
  annotations, so completion tokens scale with transcript length.
- 1 chat completion per upload against `OPENROUTER_SUMMARY_MODEL` (default
  `openai/gpt-5.6-luna`) — ~$0.005–0.01 per upload. Summarize consumes
  the outline + paragraphs and emits prose summary + searchSummary +
  per-section descriptions.
- 1 embedding call per paragraph (`embedTranscriptParagraphs`) + 2
  embedding calls per upload summary (`embedUpload`), all routed to
  `openai/text-embedding-3-small` via OpenRouter — sub-cent total per
  upload.
- `~30–60 s` wall time per upload during the live-pipeline seed (annotate
  runs first, then summarize). With 27 uploads that's **~15–30 minutes**
  of one-time LLM cost.

When the OpenAI content filter blocks either annotate or summarize
(`finish_reason=content_filter`), the wrapper retries the same request
against `OPENROUTER_ANNOTATE_FALLBACK_MODEL` /
`OPENROUTER_SUMMARY_FALLBACK_MODEL` (default `anthropic/claude-haiku-4-5`
for both). The fallback typically lands the call at ~2.9× the primary
model's per-call cost, but only when the primary fails — for the seed
corpus that's a handful of uploads per refresh.

Snapshot JSON shape per upload now includes a `sections` array keyed to
OUTLINE annotation IDs (one entry per section with a 2–3 sentence
description). Empty array on legacy snapshots from before the sections
rollout — `dev.ts` falls back to `[]` on load.

Per upload at transcript-regeneration time
(`just regenerate-seed-transcript`):

- No LLM cost — only whisper + align + diarize + segment, all local in the
  transcribe-worker container.
- Wall time depends entirely on the whisper model:
  - `base.en` (~150 MB): minutes-fast.
  - `large-v3` (~3 GB): minutes-slow on CPU, much faster on GPU.

The summary regen is also exposed at runtime via the admin "Regenerate
Summary" button on the upload edit page (`regenerateUploadSummary` tRPC
mutation → `summarizeUploadWorkflow`), which re-runs the chat + embedding
chain without re-transcribing — useful for spot-fixing summaries after
prompt changes.

## Where the moving parts live

| Concern | File |
|---|---|
| Shared transcribe pipeline | `services/transcribe/src/pipeline.py` |
| Production activity | `services/transcribe/src/activities.py` |
| Seed transcript-regen CLI (single file) | `services/transcribe/scripts/transcribe_file.py` |
| Seed transcript-regen CLI (batch, one model load) | `services/transcribe/scripts/transcribe_batch.py` |
| `just regenerate-seed-transcript` | `Justfile` |
| Bind mount of seed-data | `docker-compose.yml` (`transcribe-worker.volumes`) |
| Dev seed script | `packages/web/src/seed/dev.ts` |
| LLM snapshot id list + type + path | `packages/web/src/seed/llm-seed.ts` |
| LLM snapshot JSONs (LFS-tracked) | `seed-data/llm/*.json` |
| LLM snapshot dumper | `packages/web/src/seed/dump-llm-seed-data.ts` |
| `just dump-llm-seed-data` | `Justfile` |
| Narrow annotation bootstrap script | `packages/web/src/seed/generate-annotations.ts` |
| `just generate-seed-annotations` | `Justfile` |
| Narrow summary bootstrap script | `packages/web/src/seed/generate-summaries.ts` |
| `just generate-seed-summaries` | `Justfile` |
| Annotation pipeline activity | `packages/temporal/src/activities/background/annotate-transcript.ts` |
| Bind mount of seed-data into web | `docker-compose.yml` (`web.volumes`) |
| LFS rule for snapshots | `.gitattributes` (`seed-data/llm/*.json filter=lfs …`) |
| Storage activity (live pipeline) | `packages/temporal/src/activities/background/store-transcript-paragraphs.ts` |
| Summary workflow (live pipeline) | `packages/temporal/src/workflows/background/summarize-upload.ts` |
| LLM client + models | `packages/temporal/src/util/llm.ts` |
| ES mapping | `packages/opensearch/src/mappings.ts` (`lc_media_v1`) |
