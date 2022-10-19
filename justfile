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

create-user email password="password" role="user":
  jo schema_id=user_v0 traits=$(jo email={{email}}) metadata_public=$(jo role={{role}}) verifiable_addresses=$(jo -a $(jo value={{email}} verified=true via=email status=completed)) credentials=$(jo password=$(jo config=$(jo password={{password}}))) | curl -X POST -L -H "Content-Type: application/json" -d @- http://localhost:${HOST_ORY_KRATOS_ADMIN_PORT}/identities

console:
  cd ./etc/graphql-engine; hasura console  --console-port $HOST_CONSOLE_PORT
