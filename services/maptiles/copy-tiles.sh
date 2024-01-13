#! /usr/bin/env nix-shell
#! nix-shell -i bash -p gum rclone

y=$(date -d "yesterday" +"%Y%m%d")
d=$(gum input --placeholder $y)

if [ -z "$d" ]; then
	d=$y
fi

u=$(echo https://build.protomaps.com/$d.pmtiles)

if gum confirm "Copy $u to maptiles bucket?"; then
	rclone copyurl $u maptiles:maptiles/$d.pmtiles --progress
fi
