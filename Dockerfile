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
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/util/package.json ./packages/util/
COPY packages/s3/package.json ./packages/s3/
COPY packages/db/package.json ./packages/db/
COPY packages/elasticsearch/package.json ./packages/elasticsearch/
COPY packages/web/package.json ./packages/web/
COPY packages/import-worker/package.json ./packages/import-worker/
COPY packages/probe-worker/package.json ./packages/probe-worker/
COPY packages/transcode-worker/package.json ./packages/transcode-worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS prod-deps
WORKDIR /usr/src/app
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/util/package.json ./packages/util/
COPY packages/s3/package.json ./packages/s3/
COPY packages/db/package.json ./packages/db/
COPY packages/elasticsearch/package.json ./packages/elasticsearch/
COPY packages/web/package.json ./packages/web/
COPY packages/import-worker/package.json ./packages/import-worker/
COPY packages/probe-worker/package.json ./packages/probe-worker/
COPY packages/transcode-worker/package.json ./packages/transcode-worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/packages/util/node_modules ./packages/util/node_modules
COPY --from=deps /usr/src/app/packages/s3/node_modules ./packages/s3/node_modules
COPY --from=deps /usr/src/app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /usr/src/app/packages/elasticsearch/node_modules ./packages/elasticsearch/node_modules
COPY --from=deps /usr/src/app/packages/web/node_modules ./packages/web/node_modules
COPY --from=deps /usr/src/app/packages/import-worker/node_modules ./packages/import-worker/node_modules
COPY --from=deps /usr/src/app/packages/probe-worker/node_modules ./packages/probe-worker/node_modules
COPY --from=deps /usr/src/app/packages/transcode-worker/node_modules ./packages/transcode-worker/node_modules
COPY pnpm-workspace.yaml tsconfig.json ./
COPY packages/util ./packages/util
COPY packages/s3 ./packages/s3
COPY packages/db ./packages/db
COPY packages/elasticsearch ./packages/elasticsearch
COPY packages/web ./packages/web
COPY packages/import-worker ./packages/import-worker
COPY packages/probe-worker ./packages/probe-worker
COPY packages/transcode-worker ./packages/transcode-worker
ENV NODE_ENV=production
ENV VITE_SENTRY_DSN=https://d641f53f296e7abff3b6b269a4decfc4@o387306.ingest.sentry.io/4506108399190016
ENV VITE_TURNSTILE_SITEKEY=0x4AAAAAAAEHhiqW0UvoZTf3
RUN pnpm run -r build

FROM build AS dev
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
COPY --from=jauderho/yt-dlp:2025.03.31 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
RUN apt-get update && apt-get install -y --no-install-recommends python3 imagemagick jpegoptim ffmpeg && \
  rm -rf /var/lib/apt/lists/*

FROM base AS prod
WORKDIR /usr/src/app
COPY pnpm-workspace.yaml ./
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps /usr/src/app/packages/util/node_modules ./packages/util/node_modules
COPY --from=prod-deps /usr/src/app/packages/s3/node_modules ./packages/s3/node_modules
COPY --from=prod-deps /usr/src/app/packages/db/node_modules ./packages/db/node_modules
COPY --from=prod-deps /usr/src/app/packages/elasticsearch/node_modules ./packages/elasticsearch/node_modules
COPY --from=prod-deps /usr/src/app/packages/web/node_modules ./packages/web/node_modules
COPY --from=prod-deps /usr/src/app/packages/import-worker/node_modules ./packages/import-worker/node_modules
COPY --from=prod-deps /usr/src/app/packages/probe-worker/node_modules ./packages/probe-worker/node_modules
COPY --from=prod-deps /usr/src/app/packages/transcode-worker/node_modules ./packages/transcode-worker/node_modules
COPY --from=build /usr/src/app/packages/util/package.json ./packages/util/package.json
COPY --from=build /usr/src/app/packages/util/src ./packages/util/src
COPY --from=build /usr/src/app/packages/s3/package.json ./packages/s3/package.json
COPY --from=build /usr/src/app/packages/s3/src ./packages/s3/src
COPY --from=build /usr/src/app/packages/db/package.json ./packages/db/package.json
COPY --from=build /usr/src/app/packages/db/src ./packages/db/src
COPY --from=build /usr/src/app/packages/db/prisma ./packages/db/prisma
COPY --from=build /usr/src/app/packages/elasticsearch/package.json ./packages/elasticsearch/package.json
COPY --from=build /usr/src/app/packages/elasticsearch/src ./packages/elasticsearch/src
COPY --from=build /usr/src/app/packages/web/package.json ./packages/web/package.json
COPY --from=build /usr/src/app/packages/web/src ./packages/web/src
COPY --from=build /usr/src/app/packages/web/dist ./packages/web/dist
COPY --from=build /usr/src/app/packages/web/.output ./packages/web/.output
COPY --from=build /usr/src/app/packages/import-worker/package.json ./packages/import-worker/package.json
COPY --from=build /usr/src/app/packages/import-worker/src ./packages/import-worker/src
COPY --from=build /usr/src/app/packages/probe-worker/package.json ./packages/probe-worker/package.json
COPY --from=build /usr/src/app/packages/probe-worker/src ./packages/probe-worker/src
COPY --from=build /usr/src/app/packages/transcode-worker/package.json ./packages/transcode-worker/package.json
COPY --from=build /usr/src/app/packages/transcode-worker/src ./packages/transcode-worker/src
WORKDIR /usr/src/app/packages/web

FROM prod AS db-migrate
WORKDIR /usr/src/app/packages/db
CMD ["pnpm", "run", "prisma:migrate:deploy"]

FROM prod AS elasticsearch-migrate
WORKDIR /usr/src/app/packages/elasticsearch
CMD ["pnpm", "run", "push-mappings"]

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
CMD ["pnpm", "--filter", "@letschurch/probe-worker", "run", "start"]

FROM prod AS transcode-worker
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick jpegoptim ffmpeg && \
  rm -rf /var/lib/apt/lists/*
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
CMD ["pnpm", "--filter", "@letschurch/transcode-worker", "run", "start"]

FROM prod AS import-worker
RUN apt-get update && apt-get install -y --no-install-recommends python3 ffmpeg && \
  rm -rf /var/lib/apt/lists/*
COPY --from=jauderho/yt-dlp:2025.03.31 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
RUN /usr/local/bin/yt-dlp --update --update-to nightly
# Playwright needs to be installed after copying node_modules
RUN pnpm --filter @letschurch/import-worker exec playwright install --with-deps firefox
CMD ["pnpm", "--filter", "@letschurch/import-worker", "run", "start"]

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
COPY pnpm-workspace.yaml ./
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps /usr/src/app/packages/util/node_modules ./packages/util/node_modules
COPY --from=prod-deps /usr/src/app/packages/s3/node_modules ./packages/s3/node_modules
COPY --from=prod-deps /usr/src/app/packages/db/node_modules ./packages/db/node_modules
COPY --from=prod-deps /usr/src/app/packages/elasticsearch/node_modules ./packages/elasticsearch/node_modules
COPY --from=prod-deps /usr/src/app/packages/web/node_modules ./packages/web/node_modules
COPY --from=build /usr/src/app/packages/util/package.json ./packages/util/package.json
COPY --from=build /usr/src/app/packages/util/src ./packages/util/src
COPY --from=build /usr/src/app/packages/s3/package.json ./packages/s3/package.json
COPY --from=build /usr/src/app/packages/s3/src ./packages/s3/src
COPY --from=build /usr/src/app/packages/db/package.json ./packages/db/package.json
COPY --from=build /usr/src/app/packages/db/src ./packages/db/src
COPY --from=build /usr/src/app/packages/db/prisma ./packages/db/prisma
COPY --from=build /usr/src/app/packages/elasticsearch/package.json ./packages/elasticsearch/package.json
COPY --from=build /usr/src/app/packages/elasticsearch/src ./packages/elasticsearch/src
COPY --from=build /usr/src/app/packages/web/package.json ./packages/web/package.json
COPY --from=build /usr/src/app/packages/web/src ./packages/web/src
WORKDIR /usr/src/app/packages/web
ENV NODE_ENV=production
CMD ["pnpm", "run", "start:transcribe-worker"]
