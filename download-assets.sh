#!/usr/bin/env bash
# Restores the media files (music + videos) that were left out of the zip to
# keep the download small. Fetches the exact original files from the live site.
# Usage: bash download-assets.sh
set -e
cd "$(dirname "$0")"
ORIGIN="https://ascension.pegassi.be"
FILES="
music/pegassi-ascension.mp3
music/pegassi-circles.mp3
music/pegassi-forest-walk.mp3
music/pegassi-twinflame.mp3
videos/home-ascension1.mp4
videos/home-circles2.mp4
videos/home-forestwalk2.mp4
videos/home-twinflame1.mp4
videos/ascension-glitch.mp4
videos/circles-tomorrowland.mp4
videos/twinflame-awakenings.mp4
"
for f in $FILES; do
  if [ -s "$f" ]; then echo "skip  $f (already present)"; continue; fi
  mkdir -p "$(dirname "$f")"
  echo "fetch $f"
  curl -fL --retry 3 -o "$f" "$ORIGIN/$f"
done
echo "Done. All media restored."
