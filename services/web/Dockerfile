# FROM sqlc/sqlc:1.26.0 as sqlc
# sqlc runner
FROM golang:1.22.4-bookworm as sqlc
# Dependencies for webinstall
RUN apt-get update && apt-get install -y curl xz-utils
RUN curl -sS https://webi.sh/watchexec@2.1.1 | sh
RUN go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.26.0
ENV PATH="/root/.local/bin:${PATH}"
WORKDIR /src

# Dev / Build
FROM golang:1.22.4-bookworm

WORKDIR /usr/src/app

COPY go.* .

# Dependencies for webinstall
RUN apt-get update && apt-get install -y curl xz-utils

RUN curl -sS https://webi.sh/watchexec@2.1.1 | sh
ENV PATH="/root/.local/bin:${PATH}"

RUN curl -sS https://webi.sh/node@22.3.0 | sh
ENV PATH="/root/.local/opt/node/bin:${PATH}"

RUN go mod tidy && go mod verify && go mod download

COPY . .

RUN npm ci

RUN go build main.go
RUN npx esbuild app/index.ts app/components/player.ts app/components/transcript.ts --bundle --format=esm --minify --outdir=assets
RUN npx lightningcss-cli --minify --bundle --custom-media --targets 'last 2 versions and not dead' app/index.css app/components/player.css --output-dir assets

CMD ["go", "run", "main.go"]
