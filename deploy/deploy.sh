#!/usr/bin/env bash
# Deploy one release of the API server to this environment.
#
#   ./deploy.sh ghcr.io/<owner>/splitcount-server:sha-1a2b3c4
#
# In order: pull the image, make sure the database is up, back it up, run the
# migrations ONCE, start the new server and wait until it is healthy. A failure
# before the server starts leaves the running version untouched; an unhealthy new
# server is replaced by the previous one. Details: docs/OPERATIONS.md.
set -euo pipefail

new_image=${1:?usage: deploy.sh <image>}

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

previous_image=$SERVER_IMAGE

# One deploy at a time: two concurrent ones would run the migrations twice at once.
# `mkdir` is atomic. After a crash that skipped the cleanup: rm -r .deploy.lock
if ! mkdir .deploy.lock 2>/dev/null; then
  log 'another deploy is running (if none is, remove the .deploy.lock directory)' >&2
  exit 1
fi
trap 'rmdir .deploy.lock' EXIT

export SERVER_IMAGE=$new_image

log "pulling $new_image"
compose pull server

log 'starting the database'
compose up -d --wait db

# The migrations are not reversible: this dump is the way back from a bad one.
log 'backing up the database before migrating'
./backup.sh

log 'running the migrations'
compose run --rm migrate

log 'starting the new server'
if ! compose up -d --wait server; then
  log 'the new server did not become healthy' >&2
  if [ -n "$previous_image" ]; then
    # The database is ahead of the previous image, which the server accepts.
    log "going back to $previous_image" >&2
    SERVER_IMAGE=$previous_image compose up -d --wait server || log 'rollback failed too' >&2
  fi
  exit 1
fi

printf 'SERVER_IMAGE=%s\n' "$new_image" > release.env
log "deployed $new_image"

# Dangling layers of the previous releases: the images themselves are kept for rollbacks.
docker image prune --force > /dev/null
