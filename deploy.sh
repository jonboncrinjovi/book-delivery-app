#!/bin/sh
# Build both images here on the laptop, send them to the server, restart the app there.
set -e
cd "$(dirname "$0")"
SERVER=jonboncrinjovi@200.169.181.113
docker compose build
docker save book-delivery-app-api book-delivery-app-web | gzip | ssh "$SERVER" "gunzip | docker load"
rsync -a compose.yaml migrations "$SERVER":~/book-delivery-app/
ssh "$SERVER" "cd ~/book-delivery-app && docker compose up -d --no-build && docker compose ps"
