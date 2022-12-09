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

init: gateway-init

npmi-gateway: (exec 'gateway' 'npm' 'i')
npmi-web: (exec 'web' 'npm' 'i')
npmi: npmi-gateway npmi-web

seed-db:
  docker-compose exec gateway npm run prisma:db:seed
seed-s3:
  rclone sync -P ./seed-data/lcdevs3/letschurch-dev lcdevs3:letschurch-dev
seed: seed-db seed-s3

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
