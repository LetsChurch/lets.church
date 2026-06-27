#!/usr/bin/env bash
# Downloads the public-domain SWORD commentary modules we extract into seed
# artifacts. Run on the HOST (needs the `sword` package for extraction; only
# curl/unzip for this step). Modules land in seed/.sword (gitignored); then run:
#
#   ./scripts/sword/download-modules.sh
#   pnpm exec tsx scripts/sword/extract-commentaries.ts
#
# All five are DistributionLicense=Public Domain (Geneva notes are PD by age).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
SWORD_DIR="$PKG/seed/.sword"
BASE="https://crosswire.org/ftpmirror/pub/sword/packages/rawzip"
MODULES=(CalvinCommentaries MHC MHCC Geneva Wesley)

mkdir -p "$SWORD_DIR/zips"
for m in "${MODULES[@]}"; do
  echo "==> $m"
  curl -fsSL -o "$SWORD_DIR/zips/$m.zip" "$BASE/$m.zip"
  unzip -oq "$SWORD_DIR/zips/$m.zip" -d "$SWORD_DIR"
done

echo "Done. SWORD_PATH=$SWORD_DIR"
echo "Next: pnpm exec tsx scripts/sword/extract-commentaries.ts"
