FROM node:20.11.0-alpine3.18
RUN apk add git
WORKDIR /home/node/app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# RUN npm run build
CMD ["npm", "run", "start"]
