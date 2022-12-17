# Temporal does not support alpine: https://github.com/temporalio/sdk-typescript/issues/850
FROM debian:bullseye as build-whisper
RUN apt update && apt install -y build-essential git curl
RUN mkdir -p /home/build
RUN git clone https://github.com/ggerganov/whisper.cpp.git /home/build/whisper.cpp
WORKDIR /home/build/whisper.cpp
RUN git checkout 32fbc8c && make
RUN ./models/download-ggml-model.sh base

FROM node:19.0.0-bullseye as dev
RUN apt update && apt install -y ffmpeg imagemagick
COPY --from=build-whisper /home/build/whisper.cpp/main /usr/bin/whisper
RUN mkdir /opt/whisper
COPY --from=build-whisper /home/build/whisper.cpp/models/ggml-base.bin /opt/whisper/ggml-base.bin
WORKDIR /home/node/app
COPY . .
RUN npm ci
CMD npm run dev

FROM dev as build
ENV NODE_ENV production
WORKDIR /home/node/app
RUN npm run build

FROM node:19.0.0-bullseye as prod
RUN apt update && apt install -y ffmpeg imagemagick
COPY --from=build-whisper /home/build/whisper.cpp/main /usr/bin/whisper
RUN mkdir /opt/whisper
COPY --from=build-whisper /home/build/whisper.cpp/models/ggml-base.bin /opt/whisper/ggml-base.bin
ENV NODE_ENV production
WORKDIR /home/node/app
COPY --from=build /home/node/app/.output .
CMD node .output/server/index.mjs
