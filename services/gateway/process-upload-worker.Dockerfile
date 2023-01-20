# Temporal does not support alpine: https://github.com/temporalio/sdk-typescript/issues/850
FROM debian:bullseye as build-oxipng
RUN apt update && apt install -y build-essential curl
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install oxipng

FROM debian:bullseye as build-whisper
RUN apt update && apt install -y build-essential git curl
RUN mkdir -p /home/build
RUN git clone https://github.com/ggerganov/whisper.cpp.git /home/build/whisper.cpp
WORKDIR /home/build/whisper.cpp
RUN git checkout 32fbc8c && make
RUN ./models/download-ggml-model.sh base

FROM node:19.4.0-bullseye as service
RUN apt update && apt install -y ffmpeg imagemagick jpegoptim
COPY --from=build-oxipng /root/.cargo/bin/oxipng /usr/bin/oxipng
COPY --from=build-whisper /home/build/whisper.cpp/main /usr/bin/whisper
RUN mkdir /opt/whisper
COPY --from=build-whisper /home/build/whisper.cpp/models/ggml-base.bin /opt/whisper/ggml-base.bin
WORKDIR /home/node/app
COPY . .
RUN npm ci
CMD npm run start:process-upload-worker
