FROM golang:1.22.4-bookworm as build
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
RUN go build -v -o /usr/local/bin/app ./main.go
RUN go build -v -o /usr/local/bin/background-worker ./background-worker/main.go

RUN npm ci
RUN npx esbuild app/index.ts app/components/player.ts app/components/transcript.ts --bundle --format=esm --minify --outdir=assets
RUN npx lightningcss-cli --minify --bundle --custom-media --targets 'last 2 versions and not dead' app/index.css app/components/player.css --output-dir assets

# Prod App
FROM golang:1.22.4-bookworm as app
COPY --from=build /usr/local/bin/app /usr/local/bin/app
CMD ["app"]

# Prod Background Worker
FROM golang:1.22.6-bookworm as background-worker
COPY --from=build /usr/local/bin/background-worker /usr/local/bin/background-worker
CMD ["app"]
