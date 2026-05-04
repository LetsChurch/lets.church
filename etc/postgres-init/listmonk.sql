CREATE USER listmonk WITH PASSWORD 'listmonk';
CREATE DATABASE listmonk;
GRANT ALL PRIVILEGES ON DATABASE listmonk TO listmonk;
\c listmonk
GRANT ALL ON SCHEMA public TO listmonk;
