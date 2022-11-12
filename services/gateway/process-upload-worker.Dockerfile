# Temporal does not support alpine: https://github.com/temporalio/sdk-typescript/issues/850
FROM node:19.0.0-bullseye as dev
RUN apt update && apt install -y ffmpeg imagemagick
WORKDIR /home/node/app
COPY . .
RUN npm ci
CMD npm run dev

FROM dev as build
ENV NODE_ENV production
WORKDIR /home/node/app
RUN npm run build

FROM node:19.0.0-bullseye as prod
RUN apt update && apt install -y ffmpeg imagemagick
ENV NODE_ENV production
WORKDIR /home/node/app
COPY --from=build /home/node/app/.output .
CMD node .output/server/index.mjs