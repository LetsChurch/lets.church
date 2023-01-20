# Temporal does not support alpine: https://github.com/temporalio/sdk-typescript/issues/850
FROM node:19.4.0-bullseye
WORKDIR /home/node/app
COPY . .
RUN npm ci
CMD npm start
