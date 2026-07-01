FROM videah/oxipng:7.0.0 AS oxipng

FROM golang:1.26-bookworm AS build-download
WORKDIR /build
COPY services/download/ .
RUN CGO_ENABLED=0 GOOS=linux GOEXPERIMENT=jsonv2 go build -ldflags="-w -s" -o download-service .

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
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml pnpm-lock.yaml package.json ./
# Patched dependencies (pnpm-workspace.yaml `patchedDependencies`) — the patch
# files must be present for `pnpm install --frozen-lockfile` to apply them.
COPY --chown=nodeapp:nodeapp patches ./patches/
COPY --chown=nodeapp:nodeapp packages/util/package.json ./packages/util/
COPY --chown=nodeapp:nodeapp packages/s3/package.json ./packages/s3/
COPY --chown=nodeapp:nodeapp packages/db/package.json ./packages/db/
COPY --chown=nodeapp:nodeapp packages/opensearch/package.json ./packages/opensearch/
COPY --chown=nodeapp:nodeapp packages/temporal/package.json ./packages/temporal/
COPY --chown=nodeapp:nodeapp packages/background-worker/package.json ./packages/background-worker/
COPY --chown=nodeapp:nodeapp packages/web/package.json ./packages/web/
COPY --chown=nodeapp:nodeapp packages/lets.bible/package.json ./packages/lets.bible/
COPY --chown=nodeapp:nodeapp packages/import-worker/package.json ./packages/import-worker/
COPY --chown=nodeapp:nodeapp packages/probe-worker/package.json ./packages/probe-worker/
COPY --chown=nodeapp:nodeapp packages/transcode-worker/package.json ./packages/transcode-worker/

FROM package-json AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM package-json AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY --chown=nodeapp:nodeapp --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp --from=deps /usr/src/app/packages/ ./packages/
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml tsconfig.json package.json ./
COPY --chown=nodeapp:nodeapp packages/ ./packages/
ENV NODE_ENV=production
ENV VITE_SENTRY_DSN=https://d641f53f296e7abff3b6b269a4decfc4@o387306.ingest.sentry.io/4506108399190016
ENV VITE_TURNSTILE_SITEKEY=0x4AAAAAAAEHhiqW0UvoZTf3
RUN pnpm run -r build

FROM build AS dev
USER root
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
COPY --from=oxipng /usr/local/bin/oxipng /usr/local/bin/oxipng
RUN apt-get update && apt-get install -y --no-install-recommends python3 imagemagick jpegoptim ffmpeg procps curl && \
  ARCH=$(uname -m) && \
  if [ "$ARCH" = "x86_64" ]; then \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/download/2025.12.08/yt-dlp_linux -o /usr/local/bin/yt-dlp; \
  elif [ "$ARCH" = "aarch64" ]; then \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/download/2025.12.08/yt-dlp_linux_aarch64 -o /usr/local/bin/yt-dlp; \
  else \
    echo "Unsupported architecture: $ARCH"; exit 1; \
  fi && \
  chmod +x /usr/local/bin/yt-dlp && \
  rm -rf /var/lib/apt/lists/*
# Install Playwright system dependencies as root, then browsers as nodeapp
RUN pnpm --filter @letschurch/temporal exec playwright install-deps chromium
USER nodeapp
RUN pnpm --filter @letschurch/temporal exec playwright install chromium

# Lightweight dev image for the lets.bible app. It only needs node_modules and
# the workspace metadata; the app source is bind-mounted in dev. We skip the
# heavy `dev`/`build` layers (ffmpeg, playwright, web build) entirely.
FROM base AS lets-bible-dev
COPY --chown=nodeapp:nodeapp --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp --from=deps /usr/src/app/packages/ ./packages/
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml tsconfig.json package.json ./
COPY --chown=nodeapp:nodeapp packages/ ./packages/
ENV NODE_ENV=development

FROM base AS prod
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml package.json ./
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
COPY --from=oxipng /usr/local/bin/oxipng /usr/local/bin/oxipng
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
COPY --from=oxipng /usr/local/bin/oxipng /usr/local/bin/oxipng
USER nodeapp

FROM prod AS web
WORKDIR /usr/src/app/packages/web
CMD ["pnpm", "run", "start"]

# lets.bible app (TanStack Start). `prod` already carries its built `.output`
# (the recursive `pnpm run -r build` above builds it) + prod node_modules.
FROM prod AS letsbible
WORKDIR /usr/src/app/packages/lets.bible
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

FROM ubuntu:22.04 AS transcode-worker-ama
ARG DEBIAN_FRONTEND=noninteractive
# AMA SDK version — must match the amd-ama-driver installed on the host (e.g. tnw-worker-01).
# Bump this in lockstep with the host driver; see https://amd.github.io/ama-sdk/latest/docker.html
ARG AMA_SDK_VERSION=1.5.0
ENV PNPM_HOME="/pnpm"
ENV PATH="/opt/amd/ama/ma35/bin:$PNPM_HOME:$PATH"
ENV NODE_ENV=production
# Graft Node from the official image
COPY --from=node:24.4.1-slim /usr/local/bin/node /usr/local/bin/
COPY --from=node:24.4.1-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack && \
  corepack enable
# System tools + ffmpeg fallback (Prisma needs openssl/libssl-dev)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl openssl libssl-dev \
    wget pciutils ffmpeg imagemagick jpegoptim && \
  rm -rf /var/lib/apt/lists/*
# AMA SDK (Ubuntu 22.04 / jammy required for Xilinx APT repo)
RUN wget -qO /usr/share/keyrings/xilinx-master-signing-key.asc \
    https://www.xilinx.com/support/download/2018-2-1/xilinx-master-signing-key.asc && \
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/xilinx-master-signing-key.asc] \
    https://packages.xilinx.com/artifactory/debian-packages jammy main" \
    > /etc/apt/sources.list.d/xilinx-ama.list && \
  apt-get update && apt-get install -y --no-install-recommends \
    amd-ama-core=${AMA_SDK_VERSION}-* \
    amd-ama-xma=${AMA_SDK_VERSION}-* \
    amd-ama-ffmpeg=${AMA_SDK_VERSION}-* && \
  apt-mark hold amd-ama-core amd-ama-xma amd-ama-ffmpeg && \
  rm -rf /var/lib/apt/lists/*
COPY --from=oxipng /usr/local/bin/oxipng /usr/local/bin/oxipng
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
RUN mkdir -p /usr/src/app /data
WORKDIR /usr/src/app
RUN groupadd -r nodeapp && useradd -r -g nodeapp -m nodeapp && \
  chown -R nodeapp:nodeapp /usr/src/app /data
COPY --chown=nodeapp:nodeapp pnpm-workspace.yaml package.json ./
COPY --chown=nodeapp:nodeapp --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp --from=prod-deps /usr/src/app/packages/ ./packages/
COPY --chown=nodeapp:nodeapp --from=build /usr/src/app/packages/ ./packages/
USER nodeapp
CMD ["pnpm", "--filter", "@letschurch/transcode-worker", "run", "start"]

FROM prod-with-ffmpeg AS import-worker
USER root
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends python3 procps curl && \
  ARCH=$(uname -m) && \
  if [ "$ARCH" = "x86_64" ]; then \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/download/2025.12.08/yt-dlp_linux -o /usr/local/bin/yt-dlp; \
  elif [ "$ARCH" = "aarch64" ]; then \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/download/2025.12.08/yt-dlp_linux_aarch64 -o /usr/local/bin/yt-dlp; \
  else \
    echo "Unsupported architecture: $ARCH"; exit 1; \
  fi && \
  chmod +x /usr/local/bin/yt-dlp && \
  rm -rf /var/lib/apt/lists/*
# Install Playwright system dependencies as root, then browsers as nodeapp
RUN pnpm --filter @letschurch/import-worker exec playwright install-deps chromium
USER nodeapp
RUN pnpm --filter @letschurch/import-worker exec playwright install chromium
CMD ["pnpm", "--filter", "@letschurch/import-worker", "run", "start"]

FROM debian:bookworm-slim AS download-service
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
  rm -rf /var/lib/apt/lists/* && \
  useradd -r -M -s /sbin/nologin app
COPY --from=build-download /build/download-service /usr/local/bin/download-service
USER app
CMD ["/usr/local/bin/download-service"]

# Python Temporal worker: faster-whisper + NeMo titanet diarization + wtpsplit.
#
# Multi-arch: builds native arm64 on Apple Silicon Docker Desktop and amd64 on
# Linux/GPU hosts. We deliberately avoid the nvidia/cuda base image — PyTorch's
# pip wheels already bundle the CUDA runtime + cuDNN on amd64, and the host
# driver comes in via the NVIDIA Container Toolkit at deploy time. The cuda
# base image's libcuda stub causes NeMo's import-time CUDA probe to segfault
# under Rosetta on Apple Silicon and on no-GPU Linux build hosts.
FROM python:3.11-slim-bookworm AS transcribe-worker
ARG WHISPER_MODEL=base
ARG WTPSPLIT_MODEL=sat-12l-sm
ARG TITANET_MODEL=nvidia/speakerverification_en_titanet_large
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg libsndfile1 sox libsox-fmt-all git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx
RUN groupadd -r worker && useradd -r -g worker -m -d /home/worker worker && \
    mkdir -p /app /models/huggingface /models/torch /models/nemo \
        /home/worker/.cache/uv /home/worker/.cache/pip /home/worker/.cache/torch \
        /home/worker/.cache/huggingface /data/transcribe && \
    chown -R worker:worker /app /models /home/worker /data/transcribe
WORKDIR /app
COPY --chown=worker:worker services/transcribe/pyproject.toml services/transcribe/.python-version ./
USER worker
# uv generates uv.lock on first sync; rebuilds reuse it.
RUN uv sync && rm -rf /home/worker/.cache/uv
COPY --chown=worker:worker services/transcribe/download_models.py ./
# Pre-warm model weights straight into the HF cache via huggingface_hub.
# We never import NeMo/torch at build time — that would trigger CUDA probing
# inside the builder (no GPU) and segfault. NeMo + faster-whisper + SaT all
# resolve from the HF cache at runtime.
RUN WHISPER_MODEL=${WHISPER_MODEL} \
    WTPSPLIT_MODEL=${WTPSPLIT_MODEL} \
    TITANET_MODEL=${TITANET_MODEL} \
    uv run python download_models.py && \
    if [ -d /home/worker/.cache/huggingface ] && [ -n "$(ls -A /home/worker/.cache/huggingface 2>/dev/null)" ]; then \
        cp -r /home/worker/.cache/huggingface/* /models/huggingface/; \
    fi && \
    if [ -d /home/worker/.cache/torch ] && [ -n "$(ls -A /home/worker/.cache/torch 2>/dev/null)" ]; then \
        cp -r /home/worker/.cache/torch/* /models/torch/; \
    fi && \
    mkdir -p /models/torch/hub/checkpoints && \
    curl -fsSL -o /models/torch/hub/checkpoints/wav2vec2_fairseq_base_ls960_asr_ls960.pth \
        https://download.pytorch.org/torchaudio/models/wav2vec2_fairseq_base_ls960_asr_ls960.pth && \
    rm -rf /home/worker/.cache/huggingface/* /home/worker/.cache/torch/* /home/worker/.cache/pip/*
ENV HF_HOME=/models/huggingface \
    TORCH_HOME=/models/torch \
    NEMO_CACHE_DIR=/models/nemo
# Source last so code changes don't invalidate the model-cache layer.
COPY --chown=worker:worker services/transcribe/src/ ./src/
# Tooling for dev — used by `just regenerate-seed-transcript`.
COPY --chown=worker:worker services/transcribe/scripts/ ./scripts/
CMD ["uv", "run", "python", "-m", "src.worker"]
