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
RUN go install github.com/a-h/templ/cmd/templ@v0.2.707

COPY . .

RUN npm ci

RUN templ generate && go build main.go
RUN npx esbuild app/index.ts --bundle --format=esm --minify --outdir=assets
RUN npx lightningcss-cli --minify --bundle --custom-media --targets 'last 2 versions and not dead' app/index.css -o assets/styles.css

CMD ["go", "run", "main.go"]
