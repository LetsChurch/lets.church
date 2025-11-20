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
# Create directories before user creation to avoid needing root later
RUN mkdir -p /usr/src/app /data
WORKDIR /usr/src/app
# Create user early to avoid expensive chown operations later
RUN groupadd -r nodeapp && useradd -r -g nodeapp -m nodeapp && \
  chown -R nodeapp:nodeapp /usr/src/app /data
USER nodeapp

FROM base AS package-json
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=nodeapp:nodeapp packages/util/package.json ./packages/util/
COPY --chown=nodeapp:nodeapp packages/s3/package.json ./packages/s3/
COPY --chown=nodeapp:nodeapp packages/db/package.json ./packages/db/
COPY --chown=nodeapp:nodeapp packages/elasticsearch/package.json ./packages/elasticsearch/
COPY --chown=nodeapp:nodeapp packages/temporal/package.json ./packages/temporal/
COPY --chown=nodeapp:nodeapp packages/background-worker/package.json ./packages/background-worker/
COPY --chown=nodeapp:nodeapp packages/web/package.json ./packages/web/
COPY --chown=nodeapp:nodeapp packages/import-worker/package.json ./packages/import-worker/
COPY --chown=nodeapp:nodeapp packages/probe-worker/package.json ./packages/probe-worker/
COPY --chown=nodeapp:nodeapp packages/transcode-worker/package.json ./packages/transcode-worker/
COPY --chown=nodeapp:nodeapp packages/transcribe-worker/package.json ./packages/transcribe-worker/

FROM package-json AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM package-json AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY --chown=nodeapp:nodeapp --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp --from=deps /usr/src/app/packages/ ./packages/
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml tsconfig.json ./
COPY --chown=nodeapp:nodeapp packages/ ./packages/
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
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml ./
# Copy all node_modules
COPY --chown=nodeapp:nodeapp --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp --from=prod-deps /usr/src/app/packages/ ./packages/
# Copy package sources
COPY --chown=nodeapp:nodeapp --from=build /usr/src/app/packages/ ./packages/

# Base stage for workers with image processing dependencies
FROM prod AS prod-with-image-tools
USER root
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends imagemagick jpegoptim && \
  rm -rf /var/lib/apt/lists/*
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
USER nodeapp

# Base stage for workers with ffmpeg
FROM prod AS prod-with-ffmpeg
USER root
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
  rm -rf /var/lib/apt/lists/*
USER nodeapp

# Base stage for workers with both image tools and ffmpeg
FROM prod AS prod-with-media-tools
USER root
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends imagemagick jpegoptim ffmpeg && \
  rm -rf /var/lib/apt/lists/*
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
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

FROM prod-with-image-tools AS background-worker
CMD ["pnpm", "--filter", "@letschurch/background-worker", "run", "start"]

FROM prod-with-ffmpeg AS probe-worker
CMD ["pnpm", "--filter", "@letschurch/probe-worker", "run", "start"]

FROM prod-with-media-tools AS transcode-worker
USER root
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
USER nodeapp
CMD ["pnpm", "--filter", "@letschurch/transcode-worker", "run", "start"]

FROM prod-with-ffmpeg AS import-worker
USER root
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends python3 && \
  rm -rf /var/lib/apt/lists/*
COPY --from=jauderho/yt-dlp:2025.03.31 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
RUN /usr/local/bin/yt-dlp --update --update-to nightly
# Playwright needs to be installed after copying node_modules
RUN --mount=type=cache,target=/root/.cache/ms-playwright \
  pnpm --filter @letschurch/import-worker exec playwright install --with-deps firefox
USER nodeapp
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
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  --mount=type=cache,target=/root/.cache/pip \
  --mount=type=cache,target=/tmp/whisper-models \
  apt-get update && \
  apt-get install -y --no-install-recommends ca-certificates curl gnupg python3 python3-pip git ffmpeg && \
  mkdir -p /opt/whisper/models && \
  if [ ! -f /tmp/whisper-models/${WHISPER_MODEL}.tar.gz ]; then \
    curl -o /tmp/whisper-models/${WHISPER_MODEL}.tar.gz https://data.letschurch.cloud/whisper-ctranslate2/models/${WHISPER_MODEL}.tar.gz; \
  fi && \
  tar -xzf /tmp/whisper-models/${WHISPER_MODEL}.tar.gz -C /opt/whisper/models && \
  rm -rf /var/lib/apt/lists/* && \
  apt-get clean && \
  pip3 install --no-cache-dir git+https://github.com/Softcatala/whisper-ctranslate2.git@0.2.9
# Create directories before user creation to avoid needing root later
RUN mkdir -p /usr/src/app /data
WORKDIR /usr/src/app
# Create user early to avoid expensive chown operations later
RUN groupadd -r nodeapp && useradd -r -g nodeapp -m nodeapp && \
  chown -R nodeapp:nodeapp /usr/src/app /data
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml ./
# Copy node_modules
COPY --chown=nodeapp:nodeapp --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp --from=prod-deps /usr/src/app/packages/ ./packages/
# Copy package sources
COPY --chown=nodeapp:nodeapp --from=build /usr/src/app/packages/ ./packages/
USER nodeapp
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@letschurch/transcribe-worker", "run", "start"]
