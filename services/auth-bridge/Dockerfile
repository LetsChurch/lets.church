FROM node:18.10.0-alpine3.15 as dev
WORKDIR /home/node/app
COPY . .
RUN npm ci
CMD npm run dev

FROM dev as build
ENV NODE_ENV production
WORKDIR /home/node/app
RUN npm run build

FROM node:18.10.0-alpine3.15 as prod
ENV NODE_ENV production
WORKDIR /home/node/app
COPY --from=build /home/node/app/.output .
CMD node .output/server/index.mjs
