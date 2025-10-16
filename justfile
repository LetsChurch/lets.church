default:
  @just --choose

#
# Docker
#

start *params='-d --remove-orphans':
  docker compose up {{params}}
stop:
  docker compose down
prune:
  docker compose down --rmi local --volumes
build *params:
  docker compose build {{params}}

logs service *params:
  docker compose logs {{params}} {{service}}
follow service: (logs service '-f')

restart *services:
  docker compose restart {{services}}

restart-workers:
  docker compose restart background-worker import-worker probe-worker transcribe-worker

exec service +command:
  docker compose exec {{service}} {{command}}

ports:
  docker compose ps --format json | jq -r '.[] | .Service, .Publishers[]?.PublishedPort'

purge-pg:
  docker volume rm ${COMPOSE_PROJECT_NAME}_pg-data

npmi:
  just exec web npm i

#
# Development
#

leaks:
  gitleaks detect --baseline-path gitleaks-report.json --redact --report-path gitleaks-findings.json

temporal *args:
  docker compose exec temporal-admin-tools temporal {{args}}

db-push:
  docker compose exec web npm run prisma:db:push

db-reset:
  docker compose exec web npm run prisma:migrate:reset
  docker compose restart postgres

prisma-generate:
  docker compose exec web npm run prisma:migrate:dev

es-push-mappings:
  docker compose exec web npm run es:push-mappings

migrate-dev:
  docker compose exec web npm run prisma:migrate:dev
  npm run prisma:generate

temporal-schedule: restart-workers
  just temporal workflow execute --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-daily-salt --cron @daily --overlap-policy skip --task-queue background --workflow-type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-upload-scores --interval 5m --overlap-policy skip --task-queue background --workflow-type updateUploadScoresWorkflow --workflow-id update-upload-scores
  -just temporal schedule create --schedule-id update-comment-scores --interval 5m --overlap-policy skip --task-queue background --workflow-type updateCommentScoresWorkflow --workflow-id update-comment-scores

temporal-schedule-delete:
  just temporal schedule delete --schedule-id update-daily-salt
  just temporal schedule delete --schedule-id update-upload-scores
  just temporal schedule delete --schedule-id update-comment-scores

init: migrate-dev es-push-mappings temporal-schedule

s3-prune-multipart-uploads:
  S3_BUCKET=${S3_INGEST_BUCKET} npm run s3:prune-multipart-uploads

seed-db:
  docker compose exec web npm run prisma:db:seed
seed-s3-ingest:
  rclone sync --fast-list --checksum -P ./seed-data/lcdevs3/letschurch-dev-ingest lcdevs3:letschurch-dev-ingest
seed-s3-public:
  rclone sync --fast-list --checksum -P ./seed-data/lcdevs3/letschurch-dev-public lcdevs3:letschurch-dev-public
seed-s3: seed-s3-ingest seed-s3-public
seed: seed-s3 seed-db

reset:
  just stop
  docker volume prune --all --force
  just start
  gum spin --title "Waiting for services..." -- sleep 10
  just init seed

bootstrap:
  just start
  sleep 10
  just init seed

truncate:
  docker compose exec web npm run prisma:db:truncate

check:
  npm run check

export CI := "1"

test:
  npm test

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
