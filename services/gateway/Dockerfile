FROM debian:bullseye-slim as build-audiowaveform
RUN apt-get update && apt-get install -y git wget cmake build-essential libmad0-dev libid3tag0-dev libsndfile1-dev libgd-dev libboost-filesystem-dev libboost-program-options-dev libboost-regex-dev
RUN mkdir -p /home/build
RUN git clone https://github.com/bbc/audiowaveform.git /home/build/audiowaveform
WORKDIR /home/build/audiowaveform
RUN git checkout 1.7.1
RUN wget https://github.com/google/googletest/archive/release-1.12.1.tar.gz
RUN tar xzf release-1.12.1.tar.gz
RUN ln -s googletest-release-1.12.1 googletest
RUN mkdir build
WORKDIR /home/build/audiowaveform/build
RUN cmake -D BUILD_STATIC=1 .. && make

# Debian Base Image currently required for Prisma and M1 Macs: https://github.com/prisma/prisma/issues/8478
# Temporal does not support alpine: https://github.com/temporalio/sdk-typescript/issues/850
FROM node:20.7.0-bullseye-slim as base
# Prisma requires lbssl-dev and ca-certificates
RUN apt-get update && apt-get install -y libssl-dev ca-certificates
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
ENV NODE_ENV=production
COPY . .

FROM base as server
RUN npm run prisma:generate
CMD npm run start:server

FROM base as background-worker
RUN apt-get install -y imagemagick jpegoptim
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
RUN npm run prisma:generate
CMD npm run start:background-worker

FROM base as transcode-worker
RUN apt-get install -y imagemagick jpegoptim ffmpeg
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
CMD npm run start:transcode-worker

FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04 as transcribe-worker
ARG WHISPER_MODEL=tiny.en
RUN apt-get update && \
  apt-get install -y ca-certificates curl gnupg python3 python3-pip git ffmpeg && \
  mkdir -p /opt/whisper/models && \
  curl https://data.letschurch.cloud/whisper-ctranslate2/models/${WHISPER_MODEL}.tar.gz | tar -xz -C /opt/whisper/models && \
  mkdir -p /etc/apt/keyrings && \
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
  apt-get update && \
  apt-get install -y nodejs && \
  rm -rf /var/lib/apt/lists/* && \
  apt-get clean && \
  pip3 install git+https://github.com/Softcatala/whisper-ctranslate2.git@0.2.9 && mkdir -p /opt/whisper/models
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
CMD npm run start:transcribe-worker

FROM base as import-worker
RUN apt-get install -y python3 ffmpeg
COPY --from=jauderho/yt-dlp:2023.11.16 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
RUN npm run prisma:generate
CMD npm run start:import-worker
