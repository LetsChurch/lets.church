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
  jo schema_id=user_v0 traits=$(jo email={{email}} username={{username}}) metadata_public=$(jo role={{role}}) verifiable_addresses=$(jo -a $(jo value={{email}} verified=true via=email status=completed)) credentials=$(jo password=$(jo config=$(jo password={{password}}))) | curl -X POST -L -H "Content-Type: application/json" -d @- http://localhost:${HOST_ORY_KRATOS_ADMIN_PORT}/identities

gateway-npmi: (exec 'gateway' 'npm' 'i')

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

seed-users:
  cd scripts; npm run seed:users

seed-gateway:
  docker-compose exec gateway npm run prisma:db:seed

seed: seed-users seed-gateway

check-gateway:
  cd services/gateway; npm run check

check-scripts:
  cd scripts; npm run check

check: check-gateway check-scripts

open-graphiql:
  open http://localhost:$HOST_GATEWAY_PORT/graphql
open-mailhog:
  open http://localhost:$HOST_MAILHOG_WEB_PORT
