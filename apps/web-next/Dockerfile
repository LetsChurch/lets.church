FROM node:20.11.0-alpine3.19
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV VITE_SENTRY_DSN=https://d641f53f296e7abff3b6b269a4decfc4@o387306.ingest.sentry.io/4506108399190016
RUN npm run build
CMD ["npm", "start"]
