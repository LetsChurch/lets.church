#!/usr/bin/env bash
# Download the eBible.org World English Bible (WEB) USFM into seed/.web-usfm
# (gitignored cache). The committed artifact is the converted USX under
# seed/web/USX_1 — see build-web-usx.ts. Public domain (trademark eBible.org).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkg_root="$(cd "$here/../.." && pwd)"
dest="$pkg_root/seed/.web-usfm"
url="https://ebible.org/Scriptures/eng-web_usfm.zip"

mkdir -p "$dest"
tmp="$(mktemp -t web-usfm.XXXXXX.zip)"
echo "Downloading $url"
curl -fsSL --max-time 180 -o "$tmp" "$url"
echo "Extracting to $dest"
unzip -o -q "$tmp" -d "$dest"
rm -f "$tmp"
echo "Done: $(ls "$dest"/*.usfm | wc -l | tr -d ' ') USFM files in $dest"
