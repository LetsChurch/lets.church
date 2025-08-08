FROM node:20.7.0-alpine3.17
# https://github.com/parcel-bundler/parcel/issues/6880
RUN apk add --update python3 make g++ && rm -rf /var/cache/apk/*
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV VITE_SENTRY_DSN=https://d641f53f296e7abff3b6b269a4decfc4@o387306.ingest.sentry.io/4506108399190016
ENV VITE_TURNSTILE_SITEKEY=0x4AAAAAAAEHhiqW0UvoZTf3
RUN npm run build
CMD npm run start
