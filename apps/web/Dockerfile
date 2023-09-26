FROM node:20.7.0-alpine3.17
# https://github.com/parcel-bundler/parcel/issues/6880
RUN apk add --update python3 make g++ && rm -rf /var/cache/apk/*
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npm run build
CMD npm run start
