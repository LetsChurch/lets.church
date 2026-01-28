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

leaks:
  gitleaks detect --baseline-path gitleaks-report.json --redact --report-path gitleaks-findings.json

temporal *args:
  docker compose exec temporal-admin-tools temporal {{args}}

db-push:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run prisma:db:push'

db-reset:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run prisma:migrate:reset'
  docker compose restart postgres

prisma-generate:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run prisma:migrate:dev'

es-push-mappings:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/elasticsearch run push-mappings'

migrate-dev:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run prisma:migrate:dev'
  pnpm --filter @letschurch/db run prisma:generate

temporal-schedule: restart-workers
  just temporal workflow execute --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-daily-salt --cron @daily --overlap-policy Skip --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-upload-scores --interval 5m --overlap-policy Skip --task-queue background --type updateUploadScoresWorkflow --workflow-id update-upload-scores
  -just temporal schedule create --schedule-id update-comment-scores --interval 5m --overlap-policy Skip --task-queue background --type updateCommentScoresWorkflow --workflow-id update-comment-scores

temporal-schedule-delete:
  just temporal schedule delete --schedule-id update-daily-salt
  just temporal schedule delete --schedule-id update-upload-scores
  just temporal schedule delete --schedule-id update-comment-scores

init: migrate-dev es-push-mappings temporal-schedule

s3-prune-multipart-uploads:
  S3_BUCKET=${S3_INGEST_BUCKET} pnpm --filter @letschurch/web run s3:prune-multipart-uploads

seed-db:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/web run seed'

seed-s3-ingest:
  rclone sync --fast-list --checksum --transfers ${RCLONE_TRANSFERS} --checkers ${RCLONE_CHECKERS} -P ./seed-data/lcdevs3/letschurch-dev-ingest lcdevs3:${S3_INGEST_BUCKET}
seed-s3-public:
  rclone sync --fast-list --checksum --transfers ${RCLONE_TRANSFERS} --checkers ${RCLONE_CHECKERS} -P ./seed-data/lcdevs3/letschurch-dev-public lcdevs3:${S3_PUBLIC_BUCKET}
seed-s3-backup:
  rclone sync --fast-list --checksum --transfers ${RCLONE_TRANSFERS} --checkers ${RCLONE_CHECKERS} -P ./seed-data/lcdevs3/letschurch-dev-backup lcdevs3backup:${S3_BACKUP_BUCKET}
seed-s3: seed-s3-ingest seed-s3-public seed-s3-backup

seed: seed-s3 seed-db

reset:
  just stop
  docker volume prune --all --force
  just start
  gum spin --title "Waiting for services..." -- sleep 10
  just init seed

truncate:
  docker compose exec web sh -c 'cd /usr/src/app && pnpm --filter @letschurch/db run prisma:db:truncate'

check:
  pnpm -r run check

knip:
  pnpm knip

ncu:
  pnpm ncu

fix:
  pnpm -r run fix

ffix:
  pnpm -r run fix!

export CI := "1"

test:
  pnpm -r test

transcribe file:
  docker compose run --rm -v $PWD:/host -w /host transcribe-worker /bin/bash -c 'ffmpeg -i {{file}} -ar 16000 -ac 1 {{file}}.wav'
  docker compose run --rm -v $PWD:/host -w /host transcribe-worker /bin/bash -c 'whisper-ctranslate2 --model large-v2 --vad_filter True {{file}}.wav'
  rm {{file}}.wav

transcribe-dir dir:
  fd . {{dir}} | xargs -o -n1 just transcribe

tf *params:
  just infra/tf {{params}}

deploy env:
  just infra/deploy {{env}}

dash:
  sampler -c ./infra/sampler.yml

pv-usage *flags='-h':
  ./infra/pv-usage.sh {{flags}}
