#!/usr/bin/env bash

# server
watchexec --restart --exts go,md -- go run cmd/server/main.go &

# javascript
npx esbuild cmd/server/index.ts cmd/server/components/player.ts cmd/server/components/transcript.ts --bundle --format=esm --outdir=cmd/server/assets --watch=forever &

# css
watchexec --watch cmd --exts css -- "npx lightningcss-cli --minify --bundle --custom-media --targets 'last 2 versions and not dead' cmd/server/index.css cmd/server/components/player.css --output-dir cmd/server/assets" &

# sqlc
watchexec --watch internal --exts sql -- sqlc generate &

wait
