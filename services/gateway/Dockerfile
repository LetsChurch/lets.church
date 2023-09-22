ARG TRANSCRIBE_MODEL=tiny.en

FROM debian:bullseye-slim as build-audiowaveform
RUN apt update && apt install -y git wget cmake build-essential libmad0-dev libid3tag0-dev libsndfile1-dev libgd-dev libboost-filesystem-dev libboost-program-options-dev libboost-regex-dev
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
RUN apt install -y imagemagick jpegoptim
COPY --from=videah/oxipng:7.0.0 /usr/local/bin/oxipng /usr/local/bin/oxipng
RUN npm run prisma:generate
CMD npm run start:background-worker

FROM base as transcode-worker
RUN apt install -y imagemagick jpegoptim
COPY --from=mwader/static-ffmpeg:5.1.2 /ffmpeg /ffprobe /usr/bin/
COPY --from=build-audiowaveform /home/build/audiowaveform/build/audiowaveform /usr/bin/
CMD npm run start:transcode-worker

FROM base as transcribe-worker-base
RUN apt update && apt install -y curl python3 python3-pip git && rm -rf /var/lib/apt/lists/* && apt clean
RUN mkdir -p /opt/whisper/models

FROM transcribe-worker-base as transcribe-worker-tiny.en
RUN curl https://data.letschurch.cloud/whisper-ctranslate2/models/tiny.en.tar.gz | tar -xz -C /opt/whisper/models

FROM transcribe-worker-base as transcribe-worker-large-v2
RUN curl https://data.letschurch.cloud/whisper-ctranslate2/models/large-v2.tar.gz | tar -xz -C /opt/whisper/models

FROM transcribe-worker-${TRANSCRIBE_MODEL} as transcribe-worker
COPY --from=mwader/static-ffmpeg:5.1.2 /ffmpeg /ffprobe /usr/bin/
RUN pip3 install git+https://github.com/Softcatala/whisper-ctranslate2.git@0.2.9
CMD npm run start:transcribe-worker

FROM base as import-worker
RUN apt install -y python3
COPY --from=jauderho/yt-dlp:2023.07.06 /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
RUN npm run prisma:generate
CMD npm run start:import-worker
