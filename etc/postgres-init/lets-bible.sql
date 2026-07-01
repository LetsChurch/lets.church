CREATE USER letsbible WITH PASSWORD 'password';
CREATE DATABASE letsbible;
GRANT ALL PRIVILEGES ON DATABASE letsbible TO letsbible;
\c letsbible
GRANT ALL ON SCHEMA public TO letsbible;
