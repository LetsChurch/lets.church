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

restart service:
  docker-compose restart {{service}}

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

tctl:
  docker exec temporal-admin-tools tctl

gateway-db-push:
  docker-compose exec gateway npm run prisma:db:push

gateway-db-reset:
  docker-compose exec gateway npm run prisma:migrate:reset
  docker-compose restart postgres

gateway-prisma-generate:
  docker-compose exec gateway npm run prisma:migrate:dev

gateway-prisma-studio:
  cd services/gateway; DATABASE_URL=$HOST_DATABASE_URL npm run prisma:studio

gateway-es-push-mappings:
  docker-compose exec gateway npm run es:push-mappings

gateway-migrate-dev:
  docker-compose exec gateway npm run prisma:migrate:dev
  cd services/gateway; npm run prisma:generate

gateway-init: gateway-migrate-dev gateway-es-push-mappings

s3-init:
  cd scripts; npm run s3:cors
s3-prune-multipart-uploads:
  cd scripts; S3_BUCKET=${S3_INGEST_BUCKET} npm run s3:prune-multipart-uploads

init: gateway-init s3-init

npmi-host-scripts:
  cd scripts; npm i
npmi-host-gateway:
  cd services/gateway; npm i
npmi-host-media:
  cd services/media; npm i
npmi-host-web:
  cd apps/web; npm i
npmi-host: npmi-host-gateway npmi-host-media npmi-host-web npmi-host-scripts

npmi-gateway: (exec 'gateway' 'npm' 'i')
npmi-media: (exec 'gateway' 'npm' 'i')
npmi-web: (exec 'web' 'npm' 'i')
npmi: npmi-gateway npmi-media npmi-web

# npmci scripts always run on host (except during docker build)
npmci-scripts:
  cd scripts; npm ci
npmci-gateway:
  cd services/gateway; npm ci
npmci-media:
  cd services/media; npm ci
npmci-web:
  cd apps/web; npm ci
npmci: npmci-gateway npmci-media npmci-web npmci-scripts

seed-db:
  docker-compose exec gateway npm run prisma:db:seed
seed-s3:
  rclone sync -P ./seed-data/lcdevs3/letschurch-dev-public lcdevs3:letschurch-dev-public
seed: seed-s3 seed-db

truncate:
  docker-compose exec gateway npm run prisma:db:truncate

check-gateway:
  cd services/gateway; npm run check

check-media:
  cd services/media; npm run check

check-scripts:
  cd scripts; npm run check

check-web:
  cd apps/web; npm run check

check: check-gateway check-media check-scripts check-web

export CI := "1"

test-gateway:
  cd services/gateway; npm test

test: test-gateway

transcribe file:
  docker-compose run -v $PWD:/host -w /host process-upload-worker /bin/bash -c 'ffmpeg -i {{file}} -ar 16000 -ac 1 {{file}}.wav'
  docker-compose run -v $PWD:/host -w /host process-upload-worker /bin/bash -c 'whisper --output-vtt -m /opt/whisper/ggml-base.bin {{file}}.wav'
  rm {{file}}.wav
  mv {{file}}.wav.vtt {{file}}.vtt

transcribe-dir dir:
  fd . {{dir}} | xargs -o -n1 just transcribe

open:
  open http://localhost:$HOST_WEB_PORT
open-graphiql:
  open http://localhost:$HOST_GATEWAY_PORT/graphql
open-kibana:
  open http://localhost:$HOST_KIBANA_PORT
open-temporal:
  open http://localhost:$HOST_TEMPORAL_UI_PORT
open-mailhog:
  open http://localhost:$HOST_MAILHOG_WEB_PORT
