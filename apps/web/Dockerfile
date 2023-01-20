# This dockerfile is only used for development, the production app runs on Cloudflare Workers.
FROM node:19.4.0-alpine3.16
WORKDIR /home/node/app
COPY . .
RUN npm ci
CMD npm run dev
