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

create-user email username password="password" role="user":
  jo schema_id=user_v0 traits=$(jo email={{email}} username={{username}}) metadata_public=$(jo role={{role}}) verifiable_addresses=$(jo -a $(jo value={{email}} verified=true via=email status=completed)) credentials=$(jo password=$(jo config=$(jo password={{password}}))) | http POST http://localhost:${HOST_ORY_KRATOS_ADMIN_PORT}/identities -Fv

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

migrate-dev-gateway:
  docker-compose exec gateway npm run prisma:migrate:dev
  cd services/gateway; npm run prisma:generate
migrate-dev-ory-kratos:
  docker-compose exec ory-kratos kratos -c /etc/ory-kratos/config.yml migrate sql -e --yes
migrate-dev: migrate-dev-ory-kratos migrate-dev-gateway

npmi-gateway: (exec 'gateway' 'npm' 'i')
npmi-web: (exec 'web' 'npm' 'i')
npmi-proskairos-client: (exec 'proskairos-client' 'npm' 'i')
npmi-proskairos-worker: (exec 'proskairos-worker' 'npm' 'i')
npmi: npmi-gateway npmi-web npmi-proskairos-client npmi-proskairos-worker

seed-users:
  cd scripts; npm run seed:users

seed-gateway:
  docker-compose exec gateway npm run prisma:db:seed

seed: seed-users seed-gateway

truncate:
  docker-compose exec gateway npm run prisma:db:truncate

check-auth-hooks:
  cd services/auth-hooks; npm run check

check-external-hooks:
  cd services/external-hooks; npm run check

check-gateway:
  cd services/gateway; npm run check

check-proskairos:
  cd services/proskairos; npm run check

check-web:
  cd apps/web; npm run check

check-scripts:
  cd scripts; npm run check

check: check-auth-hooks check-gateway check-proskairos check-web check-scripts

test-proskairos:
  cd services/proskairos; npm test

test: test-proskairos

open:
  open http://localhost:$HOST_WEB_PORT
open-graphiql:
  open http://localhost:$HOST_GATEWAY_PORT/graphql
open-temporal:
  open http://localhost:$HOST_TEMPORAL_UI_PORT
open-mailhog:
  open http://localhost:$HOST_MAILHOG_WEB_PORT
