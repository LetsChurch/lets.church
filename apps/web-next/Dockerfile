FROM node:20.10.0-alpine3.18
# https://github.com/parcel-bundler/parcel/issues/6880
# RUN apk add --update python3 make g++ && rm -rf /var/cache/apk/*
WORKDIR /home/node/app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV HOST=0.0.0.0
RUN npm run build
CMD npm run start
