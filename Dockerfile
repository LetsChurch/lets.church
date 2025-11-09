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
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# Prisma Dependencies
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl libssl-dev ca-certificates curl && \
  rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS prod-deps
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV VITE_SENTRY_DSN=https://d641f53f296e7abff3b6b269a4decfc4@o387306.ingest.sentry.io/4506108399190016
ENV VITE_TURNSTILE_SITEKEY=0x4AAAAAAAEHhiqW0UvoZTf3
RUN pnpm exec prisma generate
RUN pnpm run build

FROM build AS dev
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
COPY --from=jauderho/yt-dlp:2025.03.31 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
RUN apt-get update && apt-get install -y --no-install-recommends python3 imagemagick jpegoptim ffmpeg && \
  rm -rf /var/lib/apt/lists/*

FROM base AS prod
WORKDIR /usr/src/app
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/package.json ./package.json
COPY --from=build /usr/src/app/tsconfig.json ./tsconfig.json
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/elasticsearch ./elasticsearch
COPY --from=build /usr/src/app/src ./src
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/.output ./.output
# COPY --from=build /usr/src/app/.nitro ./.nitro

FROM prod AS web
CMD ["pnpm", "run", "start"]

FROM prod AS background-worker
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick jpegoptim && \
  rm -rf /var/lib/apt/lists/*
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
CMD ["pnpm", "run", "start:background-worker"]

FROM prod AS probe-worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
  rm -rf /var/lib/apt/lists/*
CMD ["pnpm", "run", "start:probe-worker"]

FROM prod AS transcode-worker
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick jpegoptim ffmpeg && \
  rm -rf /var/lib/apt/lists/*
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
CMD ["pnpm", "run", "start:transcode-worker"]

FROM prod AS import-worker
RUN apt-get update && apt-get install -y --no-install-recommends python3 ffmpeg && \
  rm -rf /var/lib/apt/lists/*
COPY --from=jauderho/yt-dlp:2025.03.31 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
RUN /usr/local/bin/yt-dlp --update --update-to nightly
# Playwright needs to be installed after copying node_modules
RUN pnpm exec playwright install --with-deps firefox
CMD ["pnpm", "run", "start:import-worker"]

FROM nvidia/cuda:12.6.2-cudnn-runtime-ubuntu22.04 AS transcribe-worker
ARG WHISPER_MODEL=tiny.en
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
COPY --from=node:24.4.1-slim /usr/local/bin/node /usr/local/bin/
COPY --from=node:24.4.1-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
  ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
  ln -s /usr/local/lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack
RUN corepack enable
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update && \
  apt-get install -y --no-install-recommends ca-certificates curl gnupg python3 python3-pip git ffmpeg && \
  mkdir -p /opt/whisper/models && \
  curl https://data.letschurch.cloud/whisper-ctranslate2/models/${WHISPER_MODEL}.tar.gz | tar -xz -C /opt/whisper/models && \
  rm -rf /var/lib/apt/lists/* && \
  apt-get clean && \
  pip3 install --no-cache-dir git+https://github.com/Softcatala/whisper-ctranslate2.git@0.2.9
WORKDIR /usr/src/app
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
# COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/src ./src
COPY package.json tsconfig.json ./
ENV NODE_ENV=production
CMD ["pnpm", "run", "start:transcribe-worker"]
