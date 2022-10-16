#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER graphql_engine WITH PASSWORD 'password';
  CREATE DATABASE graphql_engine_metadata;
  CREATE DATABASE graphql_engine;
  GRANT ALL PRIVILEGES ON DATABASE graphql_engine_metadata TO graphql_engine;
  GRANT ALL PRIVILEGES ON DATABASE graphql_engine TO graphql_engine;
EOSQL

psql -v ON_ERROR_STOP=1 --username graphql_engine --dbname graphql_engine <<-EOSQL
  CREATE EXTENSION "uuid-ossp";
  CREATE EXTENSION citext;
EOSQL
