FROM node:19.4.0-alpine3.16
# https://github.com/parcel-bundler/parcel/issues/6880
RUN apk add --update python3 make g++ && rm -rf /var/cache/apk/*
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_TURNSTILE_SITEKEY
RUN npm run build
CMD npm run start
