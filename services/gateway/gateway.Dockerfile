# Debian Base Image currently required for Prisma and M1 Macs: https://github.com/prisma/prisma/issues/8478
FROM node:19.4.0-bullseye
WORKDIR /home/node/app
COPY . .
RUN npm ci
CMD npm start
