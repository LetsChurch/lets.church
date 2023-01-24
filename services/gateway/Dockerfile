FROM debian:bullseye-slim as build-whisper
RUN apt update && apt install -y build-essential git curl
RUN mkdir -p /home/build
RUN git clone https://github.com/ggerganov/whisper.cpp.git /home/build/whisper.cpp
WORKDIR /home/build/whisper.cpp
RUN git checkout 32fbc8c && make
RUN ./models/download-ggml-model.sh base

# Debian Base Image currently required for Prisma and M1 Macs: https://github.com/prisma/prisma/issues/8478
# Temporal does not support alpine: https://github.com/temporalio/sdk-typescript/issues/850
FROM node:19.4.0-bullseye-slim as base
# Prisma requires lbssl-dev and ca-certificates
RUN apt update && apt install -y libssl-dev ca-certificates
WORKDIR /home/node/app
COPY package.json package-lock.json ./
ENV NODE_ENV=production
RUN npm ci
COPY . .

FROM base as server
RUN npm run prisma:generate
CMD npm run start:server

FROM base as background-worker
RUN npm run prisma:generate
CMD npm run start:background-worker

FROM base as process-upload-worker
RUN apt install -y imagemagick jpegoptim
COPY --from=mwader/static-ffmpeg:5.1.2 /ffmpeg /ffprobe /usr/bin/
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
COPY --from=build-whisper /home/build/whisper.cpp/main /usr/bin/whisper
COPY --from=build-whisper /home/build/whisper.cpp/models/ggml-base.bin /opt/whisper/ggml-base.bin
RUN npm run prisma:generate
CMD npm run start:process-upload-worker
