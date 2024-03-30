FROM node:20.11.0-alpine3.19
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npm run build
CMD ["npm", "start"]
