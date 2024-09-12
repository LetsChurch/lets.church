FROM golang:1.23.1-bookworm AS build
# Dependencies for webinstall
RUN apt-get update && apt-get install -y curl xz-utils
RUN curl -sS https://webi.sh/watchexec@2.1.1 | sh

# Install sqlc
RUN go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.26.0

# Install watchexec
RUN curl -sS https://webi.sh/watchexec@2.1.1 | sh
ENV PATH="/root/.local/bin:${PATH}"

# Install node
RUN curl -sS https://webi.sh/node@22.3.0 | sh

ENV PATH="/root/.local/opt/node/bin:${PATH}"
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /usr/src/app

COPY . .

RUN npm ci
RUN npx esbuild internal/index.ts internal/components/player.ts internal/components/transcript.ts --bundle --format=esm --minify --outdir=cmd/server/assets
RUN npx lightningcss-cli --minify --bundle --custom-media --targets 'last 2 versions and not dead' internal/index.css internal/components/player.css --output-dir cmd/server/assets

RUN CGO_ENABLED=0 go build -v -o /usr/local/bin/server ./cmd/server/main.go
RUN CGO_ENABLED=0 go build -v -o /usr/local/bin/background-worker ./cmd/background-worker/main.go

# Prod Base
FROM scratch AS prod-base
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Prod Server
FROM prod-base AS server
COPY --from=build /usr/local/bin/server /usr/local/bin/server
CMD ["server"]

# Prod Background Worker
FROM prod-base AS background-worker
COPY --from=build /usr/local/bin/background-worker /usr/local/bin/background-worker
CMD ["background-worker"]
