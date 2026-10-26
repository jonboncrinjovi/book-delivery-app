#!/bin/sh
# usage: ./add-cover.sh <product id> <image file>
set -e
ID="$1"; SRC="$2"
case "$ID" in ''|*[!0-9]*) echo "usage: $0 <product id> <image file>"; exit 1;; esac
cd "$HOME/book-delivery-app"

# two unrelated random names, so the blurred file's name gives away nothing about the original's
C="covers/$(openssl rand -hex 8).jpg"
B="blur/$(openssl rand -hex 8).jpg"

convert "$SRC" -resize 400x "media/$C"
#  ↑ the real cover, scaled to 400 px wide

convert "$SRC" -resize 400x -scale 6% -scale 400x -blur 0x6 "media/$B"
#  ↑ shrink to a few pixels, blow back up (blocky), then blur the blocks:
#    colors and mood survive, the title and the image don't

docker compose exec -T db psql -U app books -c \
  "UPDATE products SET cover_path = '$C', cover_blur_path = '$B' WHERE id = $ID;"
echo "done: $C (blurred: $B)"
