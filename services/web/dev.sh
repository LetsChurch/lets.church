#!/usr/bin/env bash

# server
watchexec --restart --exts go -- go run main.go &

# javascript
npx esbuild app/index.ts --bundle --format=esm --outdir=assets --watch=forever &

# css
watchexec --watch app --exts css -- "npx lightningcss-cli --minify --bundle --custom-media --targets 'last 2 versions and not dead' app/index.css -o assets/styles.css" &

wait
