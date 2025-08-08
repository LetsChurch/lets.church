FROM debian:bullseye-slim AS build-audiowaveform
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

FROM node:24.4.1-slim AS base
RUN apt-get update && apt-get install -y curl libssl-dev ca-certificates
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV VITE_SENTRY_DSN=https://d641f53f296e7abff3b6b269a4decfc4@o387306.ingest.sentry.io/4506108399190016
ENV VITE_TURNSTILE_SITEKEY=0x4AAAAAAAEHhiqW0UvoZTf3
RUN npm run build
RUN npx prisma generate

FROM base AS web
CMD npm run start

FROM base AS background-worker
RUN apt-get install -y imagemagick jpegoptim
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
CMD npm run start:background-worker

FROM base AS probe-worker
RUN apt-get install -y ffmpeg
CMD npm run start:probe-worker

FROM base AS transcode-worker
RUN apt-get install -y imagemagick jpegoptim ffmpeg
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
CMD npm run start:transcode-worker

FROM base AS import-worker
RUN apt-get install -y python3 ffmpeg
COPY --from=jauderho/yt-dlp:2025.03.31 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
RUN /usr/local/bin/yt-dlp --update --update-to nightly
RUN npx playwright install --with-deps firefox
CMD npm run start:import-worker

FROM nvidia/cuda:12.6.2-cudnn-runtime-ubuntu22.04 AS transcribe-worker
ARG WHISPER_MODEL=tiny.en
COPY --from=node:24.4.1-slim /usr/local/bin/node /usr/local/bin/
COPY --from=node:24.4.1-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
  ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
RUN apt-get update && \
  apt-get install -y ca-certificates curl gnupg python3 python3-pip git ffmpeg && \
  mkdir -p /opt/whisper/models && \
  curl https://data.letschurch.cloud/whisper-ctranslate2/models/${WHISPER_MODEL}.tar.gz | tar -xz -C /opt/whisper/models && \
  rm -rf /var/lib/apt/lists/* && \
  apt-get clean && \
  pip3 install git+https://github.com/Softcatala/whisper-ctranslate2.git@0.2.9
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npx prisma generate
CMD npm run start:transcribe-worker
