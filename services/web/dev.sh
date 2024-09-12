#!/usr/bin/env bash

# server
watchexec --restart --exts go -- go run cmd/server/main.go &

# javascript
npx esbuild internal/index.ts internal/components/player.ts internal/components/transcript.ts --bundle --format=esm --outdir=cmd/server/assets --watch=forever &

# css
watchexec --watch internal --exts css -- "npx lightningcss-cli --minify --bundle --custom-media --targets 'last 2 versions and not dead' internal/index.css internal/components/player.css --output-dir cmd/server/assets" &

# sqlc
watchexec --watch internal --exts sql -- sqlc generate &

wait
