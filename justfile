default:
  @just --choose

#
# Docker
#

start *params='-d':
  docker-compose up {{params}}
stop:
  docker-compose down
build *params:
  docker-compose build {{params}}

logs service *params:
  docker-compose logs {{params}} {{service}}
follow service: (logs service '-f')

restart *services:
  docker-compose restart {{services}}

exec service +command:
  docker-compose exec {{service}} {{command}}

ports:
  docker-compose ps --format json | jq -r '.[] | .Service, .Publishers[]?.PublishedPort'

docker-prune *params:
  docker system prune --filter label=com.docker.compose.project=$COMPOSE_PROJECT_NAME {{params}}
prune: docker-prune (docker-prune '--volumes')

purge-pg:
  docker volume rm ${COMPOSE_PROJECT_NAME}_pg-data

#
# Development
#

leaks:
  gitleaks detect --baseline-path gitleaks-report.json --redact --report-path gitleaks-findings.json

temporal *args:
  docker-compose exec temporal-admin-tools temporal {{args}}

gateway-db-push:
  docker-compose exec gateway npm run prisma:db:push

gateway-db-reset:
  docker-compose exec gateway npm run prisma:migrate:reset
  docker-compose restart postgres

gateway-prisma-generate:
  docker-compose exec gateway npm run prisma:migrate:dev

gateway-es-push-mappings:
  docker-compose exec gateway npm run es:push-mappings

gateway-migrate-dev:
  docker-compose exec gateway npm run prisma:migrate:dev
  cd services/gateway; npm run prisma:generate

gateway-schedule:
  just temporal workflow execute --task-queue background --type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-daily-salt --cron @daily --overlap-policy skip --task-queue background --workflow-type updateDailySaltWorkflow --workflow-id update-daily-salt
  -just temporal schedule create --schedule-id update-upload-scores --interval 5m --overlap-policy skip --task-queue background --workflow-type updateUploadScoresWorkflow --workflow-id update-upload-scores
  -just temporal schedule create --schedule-id update-comment-scores --interval 5m --overlap-policy skip --task-queue background --workflow-type updateCommentScoresWorkflow --workflow-id update-comment-scores

gateway-schedule-delete:
  just temporal schedule delete --schedule-id update-daily-salt
  just temporal schedule delete --schedule-id update-upload-scores
  just temporal schedule delete --schedule-id update-comment-scores

gateway-init: gateway-migrate-dev gateway-es-push-mappings gateway-schedule

s3-prune-multipart-uploads:
  cd scripts; S3_BUCKET=${S3_INGEST_BUCKET} npm run s3:prune-multipart-uploads

init: gateway-init

npmi-host-scripts:
  cd scripts; npm i
npmi-host-gateway:
  cd services/gateway; npm i
npmi-host-web-next:
  cd apps/web-next; npm i
npmi-host-web-qwik:
  cd apps/web-qwik; npm i
npmi-host-web:
  cd apps/web; npm i
npmi-host: npmi-host-gateway npmi-host-web npmi-host-web-next npmi-host-web-qwik npmi-host-scripts

npmi-gateway: (exec 'gateway' 'npm' 'i')
npmi-web: (exec 'web' 'npm' 'i')
npmi-web-next: (exec 'web-next' 'npm' 'i')
npmi-web-qwik: (exec 'web-qwik' 'npm' 'i')
npmi: npmi-gateway npmi-web npmi-web-next npmi-web-qwik

# npmci scripts always run on host (except during docker build)
npmci-scripts:
  cd scripts; npm ci
npmci-gateway:
  cd services/gateway; npm ci
npmci-web:
  cd apps/web; npm ci
npmci-web-next:
  cd apps/web-next; npm ci
npmci-web-qwik:
  cd apps/web-qwik; npm ci
npmci: npmci-gateway npmci-web npmci-web-next npmci-web-qwik npmci-scripts

seed-db:
  docker-compose exec gateway npm run prisma:db:seed
seed-s3-ingest:
  rclone sync --fast-list --checksum -P ./seed-data/lcdevs3/letschurch-dev-ingest lcdevs3:letschurch-dev-ingest
seed-s3-public:
  rclone sync --fast-list --checksum -P ./seed-data/lcdevs3/letschurch-dev-public lcdevs3:letschurch-dev-public
seed-s3: seed-s3-ingest seed-s3-public
seed: seed-s3 seed-db

truncate:
  docker-compose exec gateway npm run prisma:db:truncate

check-gateway:
  cd services/gateway; npm run check

check-scripts:
  cd scripts; npm run check

check-web:
  cd apps/web; npm run check

check: check-gateway check-scripts check-web

export CI := "1"

test-gateway:
  cd services/gateway; npm test

test: test-gateway

transcribe file:
  docker-compose run --rm -v $PWD:/host -w /host transcribe-worker /bin/bash -c 'ffmpeg -i {{file}} -ar 16000 -ac 1 {{file}}.wav'
  docker-compose run --rm -v $PWD:/host -w /host transcribe-worker /bin/bash -c 'whisper-ctranslate2 --model large-v2 --vad_filter True {{file}}.wav'
  rm {{file}}.wav

transcribe-dir dir:
  fd . {{dir}} | xargs -o -n1 just transcribe

tf *params:
  just infra/tf {{params}}

deploy env:
  just infra/deploy {{env}}
