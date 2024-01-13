FROM node:20.10.0-alpine3.18
WORKDIR /home/node/app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npm run build
CMD npm run serve
