# Debian Base Image currently required for Prisma and M1 Macs: https://github.com/prisma/prisma/issues/8478
FROM node:19.0.0-bullseye as dev
WORKDIR /home/node/app
COPY . .
RUN npm ci
CMD npm run dev

FROM dev as build
ENV NODE_ENV production
WORKDIR /home/node/app
RUN npm run build

FROM node:19.0.0-alpine3.15 as prod
ENV NODE_ENV production
WORKDIR /home/node/app
COPY --from=build /home/node/app/package*.json .
RUN npm ci
COPY --from=build /home/node/app/dist .
CMD npm start
