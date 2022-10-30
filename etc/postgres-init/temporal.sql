CREATE USER temporal WITH PASSWORD 'password';
CREATE DATABASE temporal;
CREATE DATABASE temporal_visibility;
GRANT ALL PRIVILEGES ON DATABASE temporal TO temporal;
GRANT ALL PRIVILEGES ON DATABASE temporal_visibility TO temporal;
