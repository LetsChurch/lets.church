FROM node:19.4.0-alpine3.16
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD npm run start
