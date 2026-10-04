#!/usr/bin/env bash
# Dump this environment's database to ./backups (custom format, restorable with
# pg_restore) and keep the most recent BACKUP_KEEP dumps (default 30).
#
#   ./backup.sh
#
# deploy.sh runs it before each migration; schedule it too (cron, daily). A dump
# on the same disk as the database does not survive losing the machine: copy
# ./backups elsewhere. See docs/OPERATIONS.md for that and for restoring.
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

keep=${BACKUP_KEEP:-30}
dir=${BACKUP_DIR:-backups}
mkdir -p "$dir"

file="$dir/ardoise-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Written under another name, then renamed: a dump cut short never looks complete.
if ! compose exec -T db pg_dump --username ardoise --format custom ardoise > "$file.partial" \
  || [ ! -s "$file.partial" ]; then
  rm -f "$file.partial"
  log 'pg_dump failed' >&2
  exit 1
fi
mv "$file.partial" "$file"
log "wrote $file"

# Newest first; everything past the first $keep goes.
ls -1t "$dir"/ardoise-*.dump | tail -n +"$((keep + 1))" | xargs -r rm --
