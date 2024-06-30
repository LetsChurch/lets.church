#!/usr/bin/env bash

# server
watchexec --restart --exts go -- go run main.go &

# templ components
templ generate --watch -v --proxy="http://localhost:3000" --proxybind="0.0.0.0" --proxyport="3001" --open-browser=false &

# javascript
npx esbuild app/index.ts --bundle --format=esm --outdir=assets --watch=forever &

# css
watchexec --watch app --exts css -- "npx lightningcss-cli --minify --bundle --custom-media --targets 'last 2 versions and not dead' app/index.css -o assets/styles.css" &

# built assets
watchexec --watch assets --no-vcs-ignore -- templ generate --notify-proxy --proxybind=0.0.0.0 --proxyport=3001 &

wait
