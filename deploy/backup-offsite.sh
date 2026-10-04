#!/usr/bin/env bash
# The daily backup: dump the database (backup.sh), copy the dump off the machine
# with restic, apply the retention there, and report to a monitor.
#
#   ./backup-offsite.sh
#
# Schedule it daily (cron) for production. Configuration: backup-offsite.env next
# to this script (see backup-offsite.env.example). restic runs in its official
# image: nothing to install on the machine. See docs/OPERATIONS.md.
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

config=backup-offsite.env
# Keep in step with the restic commands in docs/OPERATIONS.md.
restic_image=restic/restic:0.18.0

if [ ! -f "$config" ]; then
  log "$config is missing (see backup-offsite.env.example)" >&2
  exit 1
fi
ping_url=$(sed -n 's/^PING_URL=//p' "$config")
environment=$(sed -n 's/^DEPLOY_ENV=//p' .env)
: "${environment:?DEPLOY_ENV is missing from .env}"

# Healthchecks.io protocol: <url>/start, then <url> on success or <url>/fail.
# Without PING_URL nothing is pinged. An unreachable monitor does not fail the
# backup: the monitor raises the alarm itself when the ping never comes.
ping_monitor() {
  [ -n "$ping_url" ] || return 0
  curl --fail --silent --show-error --max-time 10 --retry 3 --output /dev/null "$ping_url$1" \
    || log 'could not reach the monitor' >&2
}

restic() {
  # restic groups snapshots by host, and the retention applies per group: a fixed
  # name, not the container's random one.
  docker run --rm --interactive --env-file "$config" --hostname "ardoise-$environment" \
    --volume ardoise-restic-cache:/root/.cache/restic "$restic_image" "$@"
}

ping_monitor /start
trap 'if [ $? -eq 0 ]; then ping_monitor ""; else log "off-site backup failed" >&2; ping_monitor /fail; fi' EXIT

./backup.sh
dump=$(ls -1t "${BACKUP_DIR:-backups}"/ardoise-*.dump | head -1)

# One dump per snapshot, always under the same name: the snapshots form one group
# for the retention, and `dump latest /ardoise.dump` gets the newest back.
log "copying $dump off the machine"
restic backup --stdin --stdin-filename ardoise.dump < "$dump"

log 'applying the retention'
restic forget --host "ardoise-$environment" --keep-daily 30 --keep-monthly 12 --prune

log 'done'
