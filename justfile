default:
  @just --choose

#
# Docker
#

start *params='-d --remove-orphans':
  docker compose up {{params}}
preview *params='-d --remove-orphans':
  docker compose -f docker-compose.yml -f docker-compose.preview.yml up {{params}}
stop:
  docker compose down
stop-preview:
  docker compose -f docker-compose.yml -f docker-compose.preview.yml down
prune:
  docker compose down --rmi local --volumes
prune-preview:
  docker compose -f docker-compose.yml -f docker-compose.preview.yml down --rmi local --volumes
build *params:
  docker compose build {{params}}
build-preview *params:
  docker compose -f docker-compose.yml -f docker-compose.preview.yml build {{params}}

# Wait for docker services to be healthy (timeout after 60 seconds)
check-health:
  docker compose exec postgres sh -c 'timeout 60 sh -c "until pg_isready; do sleep 1; done"'
  docker compose exec elasticsearch sh -c 'timeout 60 sh -c "until curl -sf elasticsearch:9200/_cat/health >/dev/null; do sleep 1; done"'

# Start development services, initialize database, and seed data
up:
  just start
  just check-health
  just init seed

# Start preview (production) services, initialize database, and seed data
pup:
  @echo "🐶"
  just preview
  @echo "Waiting for migration services to complete..."
  @timeout 20 sh -c 'until docker compose -f docker-compose.yml -f docker-compose.preview.yml ps --status exited | grep -q "db-migrate.*Exited (0)"; do sleep 1; done' || echo "Warning: db-migrate timeout"
  @timeout 120 sh -c 'until docker compose -f docker-compose.yml -f docker-compose.preview.yml ps --status exited | grep -q "elasticsearch-migrate.*Exited (0)"; do sleep 1; done' || echo "Warning: elasticsearch-migrate timeout"
  @echo "Migrations completed successfully!"
  just seed

ppup:
  just prune-preview
  just pup

logs service *params:
  docker compose logs {{params}} {{service}}
follow service: (logs service '-f')

restart *services:
  docker compose restart {{services}}

restart-workers:
  docker compose restart background-worker import-worker probe-worker transcribe-worker transcode-worker

exec service +command:
  docker compose exec {{service}} {{command}}

ports:
  docker compose ps --format json | jq -r '.[] | .Service, .Publishers[]?.PublishedPort'

purge-pg:
  docker volume rm ${COMPOSE_PROJECT_NAME}_pg-data

pnpmi:
  just exec web pnpm install

#
# Development
#

temporal *args:
  docker compose exec temporal-admin-tools temporal {{args}}

db-generate name:
  docker compose exec web sh -c 'cd /usr/src/app/packages/db && pnpm exec drizzle-kit generate --name {{name}}'

db-migrate:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run db:migrate'

# Alias kept for compatibility
db-push: db-migrate

db-studio:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run db:studio'

db-reset:
  docker compose restart postgres
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run db:migrate'

es-push-mappings:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/elasticsearch run push-mappings'

temporal-schedule: restart-workers
  just temporal workflow execute --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-daily-salt --cron @daily --overlap-policy Skip --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-upload-scores --interval 5m --overlap-policy Skip --task-queue background --type updateUploadScoresWorkflow --workflow-id update-upload-scores
  -just temporal schedule create --schedule-id update-comment-scores --interval 5m --overlap-policy Skip --task-queue background --type updateCommentScoresWorkflow --workflow-id update-comment-scores

temporal-schedule-delete:
  just temporal schedule delete --schedule-id update-daily-salt
  just temporal schedule delete --schedule-id update-upload-scores
  just temporal schedule delete --schedule-id update-comment-scores

init: db-migrate es-push-mappings temporal-schedule

s3-prune-multipart-uploads:
  S3_BUCKET=${S3_INGEST_BUCKET} pnpm --filter @letschurch/web run s3:prune-multipart-uploads

seed-db:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run seed'

# Snapshot the current dev DB's LLM data (summaries + embeddings + paragraphs
# with embeddings) into `seed-data/llm/*.json` so the next `just seed` can
# direct-insert instead of paying OpenRouter fees and 5-15min of wall time.
# Run this after a successful live-pipeline seed (i.e. one that called the
# real summarizeUploadWorkflow); the JSONs are git-LFS-tracked, commit them.
# See docs/seed-data.md.
dump-llm-seed-data:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run dump-llm-seed-data'

# One-time bootstrap that runs only the `annotateTranscript` activity against
# the LLM-seeded uploads in the currently-seeded dev DB. Use when adding the
# annotation layer to an already-seeded local stack — cheaper than a full
# `LIVE_PIPELINE=1` refresh which would also re-summarize + re-embed.
# After this runs successfully, `just dump-llm-seed-data` captures the new
# annotations into seed-data/llm/*.json (LFS-tracked).
generate-seed-annotations:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run generate-seed-annotations'

# Re-run the summarize activity against the LLM-seeded uploads using whatever
# OUTLINE annotations are currently in the DB, then re-embed the resulting
# summary + searchSummary. Use this when the summarize prompt changes (e.g.
# the YouTube-style sections rollout) without paying for a full
# `LIVE_PIPELINE=1` reseed. After this runs successfully,
# `just dump-llm-seed-data` captures the new summaries (and the `sections`
# column) into seed-data/llm/*.json (LFS-tracked).
generate-seed-summaries:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run generate-seed-summaries'

# Apply the diarization "absorb short segments + contiguous renumber" fix to an
# already-seeded DB in place (no audio re-transcribe; annotations preserved),
# then re-index. Run after pulling the tuned diarizer; follow with
# `just dump-llm-seed-data` to snapshot the cleaned labels back into the seed.
backfill-diarization-merge:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run backfill-diarization-merge'

seed-s3-ingest:
  rclone sync --fast-list --checksum --transfers ${RCLONE_TRANSFERS} --checkers ${RCLONE_CHECKERS} -P ./seed-data/lcdevs3/letschurch-dev-ingest lcdevs3:${S3_INGEST_BUCKET}
seed-s3-public:
  rclone sync --fast-list --checksum --transfers ${RCLONE_TRANSFERS} --checkers ${RCLONE_CHECKERS} -P ./seed-data/lcdevs3/letschurch-dev-public lcdevs3:${S3_PUBLIC_BUCKET}
seed-s3-backup:
  rclone sync --fast-list --checksum --transfers ${RCLONE_TRANSFERS} --checkers ${RCLONE_CHECKERS} -P ./seed-data/lcdevs3/letschurch-dev-backup lcdevs3backup:${S3_BACKUP_BUCKET}
seed-s3: seed-s3-ingest seed-s3-public seed-s3-backup

seed: seed-s3 seed-db

# Regenerate a real seed transcript.json for one upload by running the actual
# transcribe pipeline (whisper + CTC align + titanet diarize + wtpsplit) against
# the upload's existing HLS audio. Writes directly to
# `seed-data/lcdevs3/letschurch-dev-public/{uuid}/transcript.json` (via the
# `./seed-data:/seed-data` bind mount) so the next `just seed` picks it up.
# Default model is `base.en`; pass a second arg for prod quality, e.g.
# `just regenerate-seed-transcript <uuid> large-v3` (first run downloads ~3GB).
# See `docs/seed-data.md` for the end-to-end workflow.
regenerate-seed-transcript uuid model="base.en":
  #!/usr/bin/env bash
  set -euo pipefail
  hls_dir="seed-data/lcdevs3/letschurch-dev-public/{{uuid}}"
  if [ ! -f "$hls_dir/AUDIO.m3u8" ]; then
    echo "no HLS audio at $hls_dir/AUDIO.m3u8" >&2; exit 1
  fi
  echo "running transcribe pipeline (whisper={{model}}) — first new model downloads into the container's cache"
  docker compose exec transcribe-worker sh -c \
    "cd /app && uv run --no-sync python scripts/transcribe_file.py \
      --input /seed-data/lcdevs3/letschurch-dev-public/{{uuid}}/AUDIO.m3u8 \
      --output /seed-data/lcdevs3/letschurch-dev-public/{{uuid}}/transcript.json \
      --whisper-model {{model}}"
  echo "wrote $hls_dir/transcript.json"

reset:
  just stop
  docker volume prune --all --force
  just start
  gum spin --title "Waiting for services..." -- sleep 10
  just init seed

truncate:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run db:truncate'

check:
  pnpm -r run check
  ruff format --check services/transcribe
  ruff check services/transcribe

knip:
  pnpm knip

ncu:
  pnpm ncu

fix:
  pnpm -r run fix
  cd services/download && go fmt ./...
  ruff format services/transcribe
  ruff check --fix services/transcribe

ffix:
  pnpm -r run fix!
  cd services/download && go fmt ./...
  ruff format services/transcribe
  ruff check --fix --unsafe-fixes services/transcribe

export CI := "1"

test:
  pnpm -r test
  GOEXPERIMENT=jsonv2 go -C services/download test ./...
  just test-python

# Run the transcribe worker's deterministic unit tests. Uses an ephemeral uv
# env (pytest + hypothesis only) — no torch/nemo, since the tested modules
# (vtt, windowing, segmentation) are stdlib-only.
test-python:
  cd services/transcribe && uv run --no-project --with pytest --with hypothesis pytest

transcribe file:
  docker compose run --rm -v $PWD:/host -w /host transcribe-worker /bin/bash -c 'ffmpeg -i {{file}} -ar 16000 -ac 1 {{file}}.wav'
  docker compose run --rm -v $PWD:/host -w /host transcribe-worker /bin/bash -c 'whisper-ctranslate2 --model large-v2 --vad_filter True {{file}}.wav'
  rm {{file}}.wav

transcribe-dir dir:
  fd . {{dir}} | xargs -o -n1 just transcribe
