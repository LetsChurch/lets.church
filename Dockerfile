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

FROM base AS package-json
WORKDIR /usr/src/app
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/util/package.json ./packages/util/
COPY packages/s3/package.json ./packages/s3/
COPY packages/db/package.json ./packages/db/
COPY packages/elasticsearch/package.json ./packages/elasticsearch/
COPY packages/temporal/package.json ./packages/temporal/
COPY packages/background-worker/package.json ./packages/background-worker/
COPY packages/web/package.json ./packages/web/
COPY packages/import-worker/package.json ./packages/import-worker/
COPY packages/probe-worker/package.json ./packages/probe-worker/
COPY packages/transcode-worker/package.json ./packages/transcode-worker/
COPY packages/transcribe-worker/package.json ./packages/transcribe-worker/

FROM package-json AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM package-json AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/packages/util/node_modules ./packages/util/node_modules
COPY --from=deps /usr/src/app/packages/s3/node_modules ./packages/s3/node_modules
COPY --from=deps /usr/src/app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /usr/src/app/packages/elasticsearch/node_modules ./packages/elasticsearch/node_modules
COPY --from=deps /usr/src/app/packages/temporal/node_modules ./packages/temporal/node_modules
COPY --from=deps /usr/src/app/packages/background-worker/node_modules ./packages/background-worker/node_modules
COPY --from=deps /usr/src/app/packages/web/node_modules ./packages/web/node_modules
COPY --from=deps /usr/src/app/packages/import-worker/node_modules ./packages/import-worker/node_modules
COPY --from=deps /usr/src/app/packages/probe-worker/node_modules ./packages/probe-worker/node_modules
COPY --from=deps /usr/src/app/packages/transcode-worker/node_modules ./packages/transcode-worker/node_modules
COPY --from=deps /usr/src/app/packages/transcribe-worker/node_modules ./packages/transcribe-worker/node_modules
COPY pnpm-workspace.yaml tsconfig.json ./
COPY packages/util ./packages/util
COPY packages/s3 ./packages/s3
COPY packages/db ./packages/db
COPY packages/elasticsearch ./packages/elasticsearch
COPY packages/temporal ./packages/temporal
COPY packages/background-worker ./packages/background-worker
COPY packages/web ./packages/web
COPY packages/import-worker ./packages/import-worker
COPY packages/probe-worker ./packages/probe-worker
COPY packages/transcode-worker ./packages/transcode-worker
COPY packages/transcribe-worker ./packages/transcribe-worker
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
RUN groupadd -r nodeapp && useradd -r -g nodeapp -m nodeapp
RUN mkdir -p /data && chown -R nodeapp:nodeapp /data
WORKDIR /usr/src/app
COPY pnpm-workspace.yaml ./
# Copy all node_modules
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps /usr/src/app/packages/util/node_modules ./packages/util/node_modules
COPY --from=prod-deps /usr/src/app/packages/s3/node_modules ./packages/s3/node_modules
COPY --from=prod-deps /usr/src/app/packages/db/node_modules ./packages/db/node_modules
COPY --from=prod-deps /usr/src/app/packages/elasticsearch/node_modules ./packages/elasticsearch/node_modules
COPY --from=prod-deps /usr/src/app/packages/temporal/node_modules ./packages/temporal/node_modules
COPY --from=prod-deps /usr/src/app/packages/background-worker/node_modules ./packages/background-worker/node_modules
COPY --from=prod-deps /usr/src/app/packages/web/node_modules ./packages/web/node_modules
COPY --from=prod-deps /usr/src/app/packages/import-worker/node_modules ./packages/import-worker/node_modules
COPY --from=prod-deps /usr/src/app/packages/probe-worker/node_modules ./packages/probe-worker/node_modules
COPY --from=prod-deps /usr/src/app/packages/transcode-worker/node_modules ./packages/transcode-worker/node_modules
COPY --from=prod-deps /usr/src/app/packages/transcribe-worker/node_modules ./packages/transcribe-worker/node_modules
# Copy package sources
COPY --from=build /usr/src/app/packages/util ./packages/util/
COPY --from=build /usr/src/app/packages/s3 ./packages/s3/
COPY --from=build /usr/src/app/packages/db ./packages/db/
COPY --from=build /usr/src/app/packages/elasticsearch ./packages/elasticsearch/
COPY --from=build /usr/src/app/packages/temporal ./packages/temporal/
COPY --from=build /usr/src/app/packages/background-worker ./packages/background-worker/
COPY --from=build /usr/src/app/packages/web ./packages/web/
COPY --from=build /usr/src/app/packages/import-worker ./packages/import-worker/
COPY --from=build /usr/src/app/packages/probe-worker ./packages/probe-worker/
COPY --from=build /usr/src/app/packages/transcode-worker ./packages/transcode-worker/
COPY --from=build /usr/src/app/packages/transcribe-worker ./packages/transcribe-worker/
RUN chown -R nodeapp:nodeapp /usr/src/app
USER nodeapp

FROM prod AS db-migrate
WORKDIR /usr/src/app/packages/db
CMD ["pnpm", "run", "prisma:migrate:deploy"]

FROM prod AS elasticsearch-migrate
WORKDIR /usr/src/app/packages/elasticsearch
CMD ["pnpm", "run", "push-mappings"]

FROM prod AS web
WORKDIR /usr/src/app/packages/web
CMD ["pnpm", "run", "start"]

FROM prod AS background-worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick jpegoptim && \
  rm -rf /var/lib/apt/lists/*
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
USER nodeapp
CMD ["pnpm", "--filter", "@letschurch/background-worker", "run", "start"]

FROM prod AS probe-worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
  rm -rf /var/lib/apt/lists/*
USER nodeapp
CMD ["pnpm", "--filter", "@letschurch/probe-worker", "run", "start"]

FROM prod AS transcode-worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick jpegoptim ffmpeg && \
  rm -rf /var/lib/apt/lists/*
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
USER nodeapp
CMD ["pnpm", "--filter", "@letschurch/transcode-worker", "run", "start"]

FROM prod AS import-worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 ffmpeg && \
  rm -rf /var/lib/apt/lists/*
COPY --from=jauderho/yt-dlp:2025.03.31 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
RUN /usr/local/bin/yt-dlp --update --update-to nightly
# Playwright needs to be installed after copying node_modules
RUN pnpm --filter @letschurch/import-worker exec playwright install --with-deps firefox
USER nodeapp
CMD ["pnpm", "--filter", "@letschurch/import-worker", "run", "start"]

FROM nvidia/cuda:12.6.2-cudnn-runtime-ubuntu22.04 AS transcribe-worker
ARG WHISPER_MODEL=tiny.en
RUN groupadd -r nodeapp && useradd -r -g nodeapp -m nodeapp
RUN mkdir -p /data && chown -R nodeapp:nodeapp /data
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
# Copy node_modules
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps /usr/src/app/packages/util/node_modules ./packages/util/node_modules
COPY --from=prod-deps /usr/src/app/packages/s3/node_modules ./packages/s3/node_modules
COPY --from=prod-deps /usr/src/app/packages/db/node_modules ./packages/db/node_modules
COPY --from=prod-deps /usr/src/app/packages/elasticsearch/node_modules ./packages/elasticsearch/node_modules
COPY --from=prod-deps /usr/src/app/packages/temporal/node_modules ./packages/temporal/node_modules
COPY --from=prod-deps /usr/src/app/packages/transcribe-worker/node_modules ./packages/transcribe-worker/node_modules
# Copy package sources
COPY --from=build /usr/src/app/packages/util ./packages/util/
COPY --from=build /usr/src/app/packages/s3 ./packages/s3/
COPY --from=build /usr/src/app/packages/db ./packages/db/
COPY --from=build /usr/src/app/packages/elasticsearch ./packages/elasticsearch/
COPY --from=build /usr/src/app/packages/temporal ./packages/temporal/
COPY --from=build /usr/src/app/packages/transcribe-worker ./packages/transcribe-worker/
RUN chown -R nodeapp:nodeapp /usr/src/app
USER nodeapp
WORKDIR /usr/src/app
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@letschurch/transcribe-worker", "run", "start"]
