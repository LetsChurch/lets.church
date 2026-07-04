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
  docker compose exec opensearch sh -c 'timeout 60 sh -c "until curl -sf opensearch:9200/_cat/health >/dev/null; do sleep 1; done"'

# Start development services, initialize database, and seed data (web + lets.bible)
up:
  just start
  just check-health
  just init seed
  just lb-up

# Start preview (production) services, initialize database, and seed data
pup:
  @echo "🐶"
  just preview
  @echo "Waiting for migration services to complete..."
  @timeout 20 sh -c 'until docker compose -f docker-compose.yml -f docker-compose.preview.yml ps --status exited | grep -q "db-migrate.*Exited (0)"; do sleep 1; done' || echo "Warning: db-migrate timeout"
  @timeout 120 sh -c 'until docker compose -f docker-compose.yml -f docker-compose.preview.yml ps --status exited | grep -q "opensearch-migrate.*Exited (0)"; do sleep 1; done' || echo "Warning: opensearch-migrate timeout"
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

# lets.bible — its own `letsbible` database + `lets_bible_*` ES indices, separate
# from web's. `just up` runs `lb-up` to push/seed/index it end to end;
# the individual recipes below are for re-running a single step.

# Generate a lets.bible migration from schema.ts changes (diffs against the last
# snapshot; produces the SQL + snapshot + _journal.json entry). Never hand-write.
lb-generate name:
  docker compose exec letsbible sh -c 'cd /usr/src/app/packages/lets.bible && pnpm exec drizzle-kit generate --name {{name}}'

# Apply lets.bible migrations
lb-migrate:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run db:migrate'

# Create/update the lets.bible search index mappings (its own lets_bible_* indices)
lb-es-push:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run es:push-mappings'

# Ingest the BSB Bible text (default translation; run after lb-migrate)
lb-seed-bsb:
  docker compose exec letsbible sh -c 'cd /usr/src/app && TRANSLATION_ATTRIBUTION="Berean Standard Bible — Public Domain" TRANSLATION_ATTRIBUTION_URL="https://berean.bible" pnpm --filter @letschurch/lets.bible run seed:bible'

# Ingest the MSB Bible text (second translation)
lb-seed-msb:
  docker compose exec letsbible sh -c 'cd /usr/src/app && TRANSLATION_ID=MSB TRANSLATION_NAME="Majority Standard Bible" TRANSLATION_IS_DEFAULT=false TRANSLATION_ATTRIBUTION="Majority Standard Bible — Public Domain" TRANSLATION_ATTRIBUTION_URL="https://berean.bible" USX_DIR="$(pwd)/packages/lets.bible/seed/msb/USX_1" pnpm --filter @letschurch/lets.bible run seed:bible'

# Ingest the King James Version (1769, with Strong's + morphology). Source JSON
# committed under packages/lets.bible/seed/kjv (override the path with KJV_SOURCE).
lb-seed-kjv:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run seed:kjv'

# Ingest the World English Bible (public domain). Reading + footnotes + red-letter
# only — Strong's are stripped on conversion (eBible's WEB tags are misaligned), so
# no English word-study; the original-language interlinear comes from STEPBible.
lb-seed-web:
  docker compose exec letsbible sh -c 'cd /usr/src/app && TRANSLATION_ID=WEB TRANSLATION_NAME="World English Bible" TRANSLATION_IS_DEFAULT=false TRANSLATION_ATTRIBUTION="World English Bible — Public Domain (trademark eBible.org)" TRANSLATION_ATTRIBUTION_URL="https://ebible.org/web/" USX_DIR="$(pwd)/packages/lets.bible/seed/web/USX_1" pnpm --filter @letschurch/lets.bible run seed:bible'

# Regenerate the committed WEB USX artifact (seed/web/USX_1) from eBible.org USFM.
# HOST-only; downloads USFM to seed/.web-usfm (gitignored) and converts (strips the
# misaligned Strong's, keeps footnotes + red-letter). Run before committing updates.
lb-build-web-usx:
  cd packages/lets.bible && ./scripts/web/download-web.sh && pnpm exec tsx scripts/web/build-web-usx.ts

# Seed all Bible translations (BSB + MSB + KJV + WEB) in one step
lb-seed-bible: lb-seed-bsb lb-seed-msb lb-seed-kjv lb-seed-web

# Seed the Strong's lexicon (translation-agnostic)
lb-seed-lexicon:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run seed:lexicon'

# Backfill bible_cross_reference for all translations from the committed artifact
# (seed/overlays/cross-references.json) — the seed USX is overlay-pure (no cross-ref
# notes), so this restores OT-quotation source links + study-panel cross-references.
lb-seed-crossrefs:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run seed:crossrefs'

# Regenerate the committed commentary artifacts from CrossWire SWORD modules.
# HOST-only (needs `brew install sword`); downloads modules to seed/.sword
# (gitignored) and writes seed/commentaries/*.json. Run before committing updates.
lb-extract-commentaries:
  cd packages/lets.bible && ./scripts/sword/download-modules.sh && pnpm exec tsx scripts/sword/extract-commentaries.ts

# Load the committed commentary artifacts (seed/commentaries/*.json) into
# bible_commentary[_work]. Idempotent. Run after lb-migrate.
lb-seed-commentaries:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run seed:commentaries'

# Seed the original-language interlinear (STEPBible TAGNT Greek / TAHOT Hebrew,
# fetched not committed). books = NT | OT | ALL | a comma list (default John);
# translation BSB (critical) or MSB (Byzantine).
lb-seed-source books="JHN" translation="BSB":
  docker compose exec letsbible sh -c 'cd /usr/src/app && BOOKS={{books}} TRANSLATION_ID={{translation}} pnpm --filter @letschurch/lets.bible run seed:source'

# Index all verses into the lets.bible search index (after seed + es-push)
lb-index:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run es:index-verses'

# Build/refresh the verse index against a REMOTE OpenSearch (pass its base URL as
# `host`) using the committed seed/embeddings vectors — deterministic, no OpenAI
# key. Reads verse rows from the local dev Postgres (so seed it fully first —
# `just lb-up` — the index mirrors local rows) and upserts to `host`; idempotent (creates the index +
# `lets_bible_hybrid` pipeline if missing). Rare/manual: prod images ship without
# the vectors, so this is how a remote index gets them. Export the target's creds
# first: `export OPENSEARCH_USERNAME=… OPENSEARCH_PASSWORD=…`.
lb-index-remote host:
  docker compose exec \
    -e OPENSEARCH_URL='{{host}}' \
    -e OPENSEARCH_USERNAME="$OPENSEARCH_USERNAME" \
    -e OPENSEARCH_PASSWORD="$OPENSEARCH_PASSWORD" \
    letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run es:push-mappings && pnpm --filter @letschurch/lets.bible run es:index-verses'

# Generate the committed verse-embedding artifact (packages/lets.bible/seed/
# embeddings/*, git-lfs) by embedding verse text via OpenAI — the ONE manual
# corpus-embed step (indexing only reads it). Rare: adding a translation or
# changing the model/dims. Pass a translation id to embed just that one (default:
# all in the DB). Needs OPENAI_API_KEY + a seeded DB; commit the result.
#   just lb-embed          # all translations
#   just lb-embed BSB      # one
lb-embed tid='':
  docker compose exec -e TRANSLATION_ID='{{tid}}' letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run es:embed-verses'

# Build the client-side FlexSearch search assets per translation (public/search/*)
lb-flex:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run flex:build'

# Full lets.bible setup: migrate, push ES mappings, seed (bible/lexicon/cross-refs/
# commentaries/original-language source tokens), index, flex. (cross-refs,
# commentaries, and source tokens are separate tables — included here so they aren't
# empty after a DB reset. Source tokens = the whole-Bible "Original" interlinear:
# BSB (NT critical Greek + shared Masoretic OT), then each translation's NT under
# its own Greek basis — KJV=Textus Receptus, MSB/WEB=Byzantine — matching what the
# prod provision init container seeds.)
lb-up: lb-migrate lb-es-push lb-seed-bible lb-seed-lexicon lb-seed-crossrefs lb-seed-commentaries (lb-seed-source "ALL" "BSB") (lb-seed-source "NT" "KJV") (lb-seed-source "NT" "MSB") (lb-seed-source "NT" "WEB") lb-index lb-flex

os-push-mappings:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/opensearch run push-mappings'

temporal-schedule: restart-workers
  just temporal workflow execute --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-daily-salt --cron @daily --overlap-policy Skip --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-upload-scores --interval 5m --overlap-policy Skip --task-queue background --type updateUploadScoresWorkflow --workflow-id update-upload-scores
  -just temporal schedule create --schedule-id update-comment-scores --interval 5m --overlap-policy Skip --task-queue background --type updateCommentScoresWorkflow --workflow-id update-comment-scores

temporal-schedule-delete:
  just temporal schedule delete --schedule-id update-daily-salt
  just temporal schedule delete --schedule-id update-upload-scores
  just temporal schedule delete --schedule-id update-comment-scores

init: db-migrate os-push-mappings temporal-schedule

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

# Re-index the LLM-seeded uploads into lc_media_v1 so the new doc-level
# `bibleRefs` field (the Bible-verse facet source) is populated from existing
# BIBLE annotations. Run after `just os-push-mappings` adds the field. No LLM
# calls and nothing to dump — `bibleRefs` is derived at index time from the
# annotations already in the DB. (Prod equivalent: a full media re-index.)
generate-seed-bible-refs:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run generate-seed-bible-refs'

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
  docker compose run --rm -v $PWD:/host -w /app transcribe-worker \
    uv run --no-sync python scripts/transcribe_file.py \
      --input /host/{{file}} \
      --output /host/{{file}}.transcript.json

transcribe-dir dir:
  fd . {{dir}} | xargs -o -n1 just transcribe
