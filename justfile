default:
  @just --choose

#
# Shared infrastructure
#
# Postgres, OpenSearch, Temporal, Valkey, Mailpit, imgproxy, the download
# service and the Traefik HTTPS router run ONCE, in the `lc-infra` compose
# project (docker-compose.infra.yml), and every checkout's app stack below
# connects to them. See docs/worktrees.md.

# Start the shared infrastructure (idempotent) and wait until it's healthy
infra-up *params:
  scripts/dev-env.sh infra-up {{params}}
infra-stop:
  scripts/dev-env.sh infra down
# Any docker compose command against the infra project, e.g. `just infra logs -f postgres`
infra *args:
  scripts/dev-env.sh infra {{args}}
# Delete the shared infrastructure's data volumes — every checkout's databases and indices
infra-prune:
  scripts/dev-env.sh infra down --volumes

#
# Worktrees
#
# `wt switch --create <branch>` runs these through .config/wt.toml; they work in
# any `git worktree` too.

# Provision + start this worktree: copy the primary checkout's databases and
# indices (`clone`, default), or start empty and run the seeds (`fresh`)
wt-up mode='clone':
  scripts/dev-env.sh wt-up {{mode}}
# Stop this worktree and delete its databases, indices, Temporal namespace, cache, and certificate
wt-down:
  scripts/dev-env.sh wt-down
# Print this checkout's URLs and resource names
wt-info:
  @scripts/dev-env.sh wt-info
# (Re)issue the mkcert certificates for the infra hosts and this checkout
wt-cert:
  scripts/dev-env.sh cert

#
# Docker (this checkout's app containers)
#

start *params='-d --remove-orphans': infra-up
  docker compose up {{params}}
preview *params='-d --remove-orphans': infra-up
  docker compose -f docker-compose.yml -f docker-compose.preview.yml $([ "$LC_ROUTING" = ports ] && echo '-f docker-compose.ports.yml') up {{params}}
stop:
  docker compose --profile '*' down
stop-preview:
  docker compose -f docker-compose.yml -f docker-compose.preview.yml --profile '*' down
prune:
  docker compose --profile '*' down --rmi local --volumes
prune-preview:
  docker compose -f docker-compose.yml -f docker-compose.preview.yml --profile '*' down --rmi local --volumes
build *params:
  docker compose build {{params}}
build-preview *params:
  docker compose -f docker-compose.yml -f docker-compose.preview.yml build {{params}}

# Wait for the shared infrastructure to be healthy
check-health:
  scripts/dev-env.sh infra-up

# Start development services, initialize database, and seed data (web + lets.bible).
# In a worktree, use `just wt-up` instead.
up:
  just start
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

# Restart whichever workers this checkout runs (transcribe-worker is a profile)
restart-workers:
  #!/usr/bin/env bash
  set -euo pipefail
  workers=$(docker compose ps --services --status running | grep -- '-worker$' || true)
  [ -z "$workers" ] || docker compose restart $workers

exec service +command:
  docker compose exec {{service}} {{command}}

ports:
  docker compose ps --format json | jq -r '.[] | .Service, .Publishers[]?.PublishedPort'

pnpmi:
  just exec web pnpm install

#
# Development
#

# Temporal CLI, scoped to this checkout's namespace (TEMPORAL_NAMESPACE)
temporal *args:
  scripts/dev-env.sh temporal {{args}}

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

# Regenerate the verse-text asset the transcript annotator matches spoken
# Scripture quotations against (KJV + WEB + BSB, from the seeded lets.bible DB).
# Commit the result; rerun after re-seeding a translation.
lb-export-verse-text:
  docker compose exec -T letsbible sh -c 'cd /usr/src/app && pnpm --silent --filter @letschurch/lets.bible run export:verse-text' > packages/temporal/src/util/scripture/data/verse-text.tsv.gz.tmp
  gzip -t packages/temporal/src/util/scripture/data/verse-text.tsv.gz.tmp
  mv packages/temporal/src/util/scripture/data/verse-text.tsv.gz.tmp packages/temporal/src/util/scripture/data/verse-text.tsv.gz

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

# Index all thought-unit passages (translator paragraphs) into lets_bible_passages
# — the verse-finder's spanning-thought recall lane (after seed + es-push). Uses
# the committed seed/passage-embeddings vectors; lexical-only if absent.
lb-index-passages:
  docker compose exec letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run es:index-passages'

# Build/refresh BOTH the verse index AND the thought-unit passage index against a
# REMOTE OpenSearch (pass its base URL as `host`) using the committed
# seed/embeddings + seed/passage-embeddings vectors — deterministic, no OpenAI
# key. Reads rows from the local dev Postgres (so seed it fully first —
# `just lb-up` — the indices mirror local rows) and upserts to `host`; idempotent (creates both indices +
# `lets_bible_hybrid` pipeline if missing). Rare/manual: prod images ship without
# the vectors, so this is how a remote index gets them (run `git lfs pull` first).
# Auth is OPTIONAL — export
# OPENSEARCH_USERNAME/PASSWORD only for a secured target; omit them for a
# non-secure cluster (client.ts sends no auth when they're empty). NOTE: the run
# is inside the letsbible container, which isn't on your tailnet — pass a routable
# IP, not a MagicDNS name (e.g. http://100.x.y.z:9200, not http://core-opensearch).
lb-index-remote host:
  docker compose exec \
    -e OPENSEARCH_URL='{{host}}' \
    -e OPENSEARCH_USERNAME="${OPENSEARCH_USERNAME:-}" \
    -e OPENSEARCH_PASSWORD="${OPENSEARCH_PASSWORD:-}" \
    letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run es:push-mappings && pnpm --filter @letschurch/lets.bible run es:index-verses && pnpm --filter @letschurch/lets.bible run es:index-passages'

# Generate the committed verse-embedding artifact (packages/lets.bible/seed/
# embeddings/*, git-lfs) by embedding verse text via OpenAI — the ONE manual
# corpus-embed step (indexing only reads it). Rare: adding a translation or
# changing the model/dims. Pass a translation id to embed just that one (default:
# all in the DB). Needs OPENAI_API_KEY + a seeded DB; commit the result.
#   just lb-embed          # all translations
#   just lb-embed BSB      # one
lb-embed tid='':
  docker compose exec -e TRANSLATION_ID='{{tid}}' letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run es:embed-verses'

# Generate the committed PASSAGE (thought-unit) embedding artifact
# (packages/lets.bible/seed/passage-embeddings/*, git-lfs) by embedding each
# translator paragraph via OpenAI — the manual corpus-embed step for the passage
# lane (index-passages only reads it). Rare: run once, then commit. Pass a
# translation id to embed just one (default: BSB/MSB/WEB — KJV is prose-only, no
# paragraphs). Needs OPENAI_API_KEY + a seeded DB.
#   just lb-embed-passages          # all paragraphed translations
#   just lb-embed-passages BSB      # one
lb-embed-passages tid='':
  docker compose exec -e TRANSLATION_ID='{{tid}}' letsbible sh -c 'cd /usr/src/app && pnpm --filter @letschurch/lets.bible run es:embed-passages'

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
lb-up: lb-migrate lb-es-push lb-seed-bible lb-seed-lexicon lb-seed-crossrefs lb-seed-commentaries (lb-seed-source "ALL" "BSB") (lb-seed-source "NT" "KJV") (lb-seed-source "NT" "MSB") (lb-seed-source "NT" "WEB") lb-index lb-index-passages lb-flex

os-push-mappings:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/opensearch run push-mappings'

# Fixed schedules are reconciled by the background worker on boot
# (packages/temporal/src/schedules.ts); this just seeds the first salt.
temporal-schedule: restart-workers
  just temporal workflow execute --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt

temporal-schedule-delete:
  just temporal schedule delete --schedule-id update-daily-salt
  just temporal schedule delete --schedule-id update-upload-scores
  just temporal schedule delete --schedule-id update-comment-scores
  just temporal schedule delete --schedule-id org-channel-link-digest

init: db-migrate os-push-mappings temporal-schedule

s3-prune-multipart-uploads:
  pnpm run s3:prune-multipart-uploads

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

# Run the reproducible annotation model/strategy matrix against the gold corpus.
# Pass CLI options through verbatim; start with --dry-run to validate the model
# IDs, pricing, corpus, and call count without spending.
#   just eval-annotation-models --models openai/gpt-6-luna,openai/gpt-6.1-sol --dry-run
eval-annotation-models *args:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run eval:annotation-models -- {{args}}'

# Score Scripture-reference detection (stored LLM annotations vs. the layered
# pipeline) against the hand-labeled gold set. No LLM calls.
#   just eval-scripture-refs [/seed-data/eval/scripture-refs-20261027]
eval-scripture-refs *args:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run eval:scripture-refs -- {{args}}'

# Re-derive every transcribed upload's BIBLE annotations with the layered
# Scripture-reference pipeline (no LLM calls) and reindex the ones that change.
# Idempotent; progress via the getBackfillScriptureRefsProgress query.
backfill-scripture-refs:
  just temporal workflow start --task-queue background --type backfillScriptureRefsWorkflow --workflow-id backfill-scripture-refs --input '{}'

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

# One-time: measure every processed upload's public-bucket bytes so storage
# location caps and the admin storage page reflect existing artifacts. Safe to
# re-run; only unmeasured uploads are visited.
backfill-public-sizes:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run backfill-public-sizes'

# Re-index the LLM-seeded uploads into lc_media_v1 so the new doc-level
# `bibleRefs` field (the Bible-verse facet source) is populated from existing
# BIBLE annotations. Run after `just os-push-mappings` adds the field. No LLM
# calls and nothing to dump — `bibleRefs` is derived at index time from the
# annotations already in the DB. (Prod equivalent: a full media re-index.)
generate-seed-bible-refs:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run generate-seed-bible-refs'

seed-s3-ingest:
  rclone sync --fast-list --checksum --transfers ${RCLONE_TRANSFERS} --checkers ${RCLONE_CHECKERS} -P ./seed-data/lcdevs3/letschurch-dev-ingest lcdevs3:${STORAGE_IDRIVE_INGEST_BUCKET}
seed-s3-public:
  rclone sync --fast-list --checksum --transfers ${RCLONE_TRANSFERS} --checkers ${RCLONE_CHECKERS} -P ./seed-data/lcdevs3/letschurch-dev-public lcdevs3:${STORAGE_IDRIVE_PUBLIC_BUCKET}
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

# Start over from empty data. In a worktree this only resets that worktree; in
# the primary checkout it wipes the shared infrastructure, i.e. every
# worktree's databases and indices too.
reset:
  #!/usr/bin/env bash
  set -euo pipefail
  if [ "$LC_WT" != main ]; then
    just wt-down
    just wt-up fresh
    exit
  fi
  just stop
  just infra-prune
  docker volume prune --all --force
  just start
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

#
# Live streaming
#

# Stream a local video file to an RTMPS ingest endpoint + stream key in real
# time, for testing live streaming. Pass the Server URL shown in the channel's
# live settings as `server`; the publish URL is "<server>/<key>". Streams once
# and disconnects when the file ends — which completes the broadcast and
# triggers the recording import — or stop early with Ctrl-C. Requires ffmpeg
# built with RTMPS/TLS support.
# Example: just stream-rtmps ~/clip.mp4 <stream-key> rtmps://global-live.mux.com:443/app
stream-rtmps file key server:
  ffmpeg -re -i "{{file}}" \
    -c:v libx264 -preset veryfast -tune zerolatency -profile:v high -pix_fmt yuv420p \
    -b:v 4500k -maxrate 4500k -bufsize 9000k -g 60 \
    -c:a aac -b:a 128k -ar 44100 \
    -f flv "{{server}}/{{key}}"
