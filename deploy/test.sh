#!/usr/bin/env bash
# Checks the order and the failure handling of deploy.sh, backup.sh and
# backup-offsite.sh against stand-ins for `docker` and `curl` that record their
# calls. No Docker needed:
#
#   deploy/test.sh
#
# Run in CI (.github/workflows/ci.yml). It cannot tell whether the compose file
# works: CI validates that separately with `docker compose config`.
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
failures=0

check() { # check <description> <condition...>
  local description=$1
  shift
  if "$@"; then
    printf 'ok   %s\n' "$description"
  else
    printf 'FAIL %s\n' "$description"
    failures=$((failures + 1))
  fi
}

# A throwaway copy of the scripts with a fake `docker` first in PATH. The fake
# logs "<arguments> [SERVER_IMAGE=<value>]", fails when that line contains
# $FAIL_ON, prints something when asked to run pg_dump, and keeps what restic is
# given to back up in $SHIM_LOG.stdin. A fake `curl` logs "curl <arguments>" to the
# same log and fails the same way.
fresh_sandbox() {
  sandbox=$(mktemp -d)
  mkdir "$sandbox/bin"
  cp "$here/deploy.sh" "$here/backup.sh" "$here/backup-offsite.sh" "$here/lib.sh" "$sandbox/"
  : > "$sandbox/.env"
  export SHIM_LOG="$sandbox/docker.log"
  : > "$SHIM_LOG"
  cat > "$sandbox/bin/docker" <<'SHIM'
#!/usr/bin/env bash
line="$* [SERVER_IMAGE=${SERVER_IMAGE:-}]"
echo "$line" >> "$SHIM_LOG"
if [ -n "${FAIL_ON:-}" ] && [[ "$line" == *"$FAIL_ON"* ]]; then
  exit 1
fi
case "$line" in
  *pg_dump*) echo PGDMP ;;
  *'backup --stdin'*) cat > "$SHIM_LOG.stdin" ;;
esac
SHIM
  cat > "$sandbox/bin/curl" <<'SHIM'
#!/usr/bin/env bash
line="curl $*"
echo "$line" >> "$SHIM_LOG"
if [ -n "${FAIL_ON:-}" ] && [[ "$line" == *"$FAIL_ON"* ]]; then
  exit 1
fi
SHIM
  chmod +x "$sandbox/bin/docker" "$sandbox/bin/curl" "$sandbox/deploy.sh" "$sandbox/backup.sh" \
    "$sandbox/backup-offsite.sh"
  export PATH="$sandbox/bin:$PATH"
  unset FAIL_ON SERVER_IMAGE
}

logged() { grep -qF -- "$1" "$SHIM_LOG"; }
line_of() { grep -nF -- "$1" "$SHIM_LOG" | head -1 | cut -d: -f1; }
before() { # before <a> <b>: both logged, and a first
  local a b
  a=$(line_of "$1")
  b=$(line_of "$2")
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]
}

echo '# the scripts run on the machine are executable (the deploy copies their mode)'
for script in deploy.sh backup.sh backup-offsite.sh compose.sh; do
  check "$script" test -x "$here/$script"
done

echo '# deploy: happy path'
fresh_sandbox
"$sandbox/deploy.sh" img:new > /dev/null
check 'exits 0' test $? -eq 0
check 'pulls before anything else' before 'compose --env-file .env pull' 'up -d --wait db'
check 'backs up after the database is up' before 'up -d --wait db' 'pg_dump'
check 'migrates after the backup' before 'pg_dump' 'run --rm migrate'
check 'starts the server after migrating' before 'run --rm migrate' 'up -d --wait server'
check 'records the release' grep -qx 'SERVER_IMAGE=img:new' "$sandbox/release.env"
check 'releases the lock' test ! -e "$sandbox/.deploy.lock"
check 'leaves one dump' test "$(ls "$sandbox"/backups/*.dump | wc -l)" -eq 1

echo '# deploy: the migration fails'
fresh_sandbox
echo 'SERVER_IMAGE=img:old' > "$sandbox/release.env"
FAIL_ON='run --rm migrate' "$sandbox/deploy.sh" img:new > /dev/null 2>&1
check 'exits non-zero' test $? -ne 0
check 'never starts the new server' bash -c '! grep -qF -- "up -d --wait server" "$SHIM_LOG"'
check 'keeps the previous release' grep -qx 'SERVER_IMAGE=img:old' "$sandbox/release.env"
check 'releases the lock' test ! -e "$sandbox/.deploy.lock"

echo '# deploy: the backup fails'
fresh_sandbox
FAIL_ON='pg_dump' "$sandbox/deploy.sh" img:new > /dev/null 2>&1
check 'exits non-zero' test $? -ne 0
check 'does not migrate' bash -c '! grep -qF -- "run --rm migrate" "$SHIM_LOG"'
check 'leaves no partial dump' test -z "$(ls "$sandbox"/backups 2> /dev/null)"

echo '# deploy: the new server is unhealthy'
fresh_sandbox
echo 'SERVER_IMAGE=img:old' > "$sandbox/release.env"
FAIL_ON='up -d --wait server [SERVER_IMAGE=img:new]' "$sandbox/deploy.sh" img:new > /dev/null 2>&1
check 'exits non-zero' test $? -ne 0
check 'starts the previous image again' logged 'up -d --wait server [SERVER_IMAGE=img:old]'
check 'keeps the previous release' grep -qx 'SERVER_IMAGE=img:old' "$sandbox/release.env"

echo '# deploy: first release, unhealthy'
fresh_sandbox
FAIL_ON='up -d --wait server' "$sandbox/deploy.sh" img:new > /dev/null 2>&1
check 'exits non-zero without a rollback target' test $? -ne 0
check 'writes no release' test ! -e "$sandbox/release.env"

echo '# deploy: another deploy is running'
fresh_sandbox
mkdir "$sandbox/.deploy.lock"
"$sandbox/deploy.sh" img:new > /dev/null 2>&1
check 'refuses' test $? -ne 0
check 'touches nothing' test ! -s "$SHIM_LOG"
check 'leaves the other deploy lock alone' test -d "$sandbox/.deploy.lock"

echo '# backup: retention'
fresh_sandbox
mkdir "$sandbox/backups"
for day in 01 02 03 04 05; do
  : > "$sandbox/backups/ardoise-202601${day}T000000Z.dump"
  touch -d "2026-01-$day" "$sandbox/backups/ardoise-202601${day}T000000Z.dump"
done
BACKUP_KEEP=3 "$sandbox/backup.sh" > /dev/null
check 'keeps the newest N' test "$(ls "$sandbox"/backups/*.dump | wc -l)" -eq 3
check 'drops the oldest' test ! -e "$sandbox/backups/ardoise-20260101T000000Z.dump"
check 'keeps the one just taken' bash -c 'ls "$1"/backups/*.dump | grep -qv 2026010' _ "$sandbox"

# An environment with off-site backups configured, pinging a monitor.
fresh_offsite_sandbox() {
  fresh_sandbox
  echo 'DEPLOY_ENV=production' > "$sandbox/.env"
  printf '%s\n' 'RESTIC_REPOSITORY=s3:https://s3.example.com/bucket' \
    'PING_URL=https://ping.example.com/check' > "$sandbox/backup-offsite.env"
}
ping_success_last() { tail -1 "$SHIM_LOG" | grep -q 'https://ping.example.com/check$'; }

echo '# off-site backup: happy path'
fresh_offsite_sandbox
"$sandbox/backup-offsite.sh" > /dev/null 2>&1
check 'exits 0' test $? -eq 0
check 'signals the start first' before 'ping.example.com/check/start' 'pg_dump'
check 'dumps before copying' before 'pg_dump' 'backup --stdin'
check 'copies the dump just taken' grep -qx PGDMP "$SHIM_LOG.stdin"
check 'copies under a fixed host name' logged '--hostname ardoise-production'
check 'applies the retention after the copy' before 'backup --stdin' 'forget --host ardoise-production'
check 'signals success last' ping_success_last
check 'never signals a failure' bash -c '! grep -qF -- "/check/fail" "$SHIM_LOG"'

echo '# off-site backup: the dump fails'
fresh_offsite_sandbox
FAIL_ON='pg_dump' "$sandbox/backup-offsite.sh" > /dev/null 2>&1
check 'exits non-zero' test $? -ne 0
check 'copies nothing' bash -c '! grep -qF -- "backup --stdin" "$SHIM_LOG"'
check 'signals the failure' logged 'ping.example.com/check/fail'

echo '# off-site backup: the copy fails'
fresh_offsite_sandbox
FAIL_ON='backup --stdin' "$sandbox/backup-offsite.sh" > /dev/null 2>&1
check 'exits non-zero' test $? -ne 0
check 'applies no retention' bash -c '! grep -qF -- "forget" "$SHIM_LOG"'
check 'signals the failure' logged 'ping.example.com/check/fail'

echo '# off-site backup: the retention fails'
fresh_offsite_sandbox
FAIL_ON='forget' "$sandbox/backup-offsite.sh" > /dev/null 2>&1
check 'exits non-zero' test $? -ne 0
check 'signals the failure' logged 'ping.example.com/check/fail'

echo '# off-site backup: the monitor is unreachable'
fresh_offsite_sandbox
FAIL_ON='ping.example.com' "$sandbox/backup-offsite.sh" > /dev/null 2>&1
check 'still exits 0' test $? -eq 0
check 'still copies and applies the retention' logged 'forget --host ardoise-production'

echo '# off-site backup: no monitor configured'
fresh_offsite_sandbox
echo 'RESTIC_REPOSITORY=s3:https://s3.example.com/bucket' > "$sandbox/backup-offsite.env"
"$sandbox/backup-offsite.sh" > /dev/null 2>&1
check 'exits 0' test $? -eq 0
check 'pings nothing' bash -c '! grep -q "^curl" "$SHIM_LOG"'

echo '# off-site backup: not configured'
fresh_offsite_sandbox
rm "$sandbox/backup-offsite.env"
"$sandbox/backup-offsite.sh" > /dev/null 2>&1
check 'refuses' test $? -ne 0
check 'touches nothing' test ! -s "$SHIM_LOG"

if [ "$failures" -ne 0 ]; then
  printf '\n%d check(s) failed\n' "$failures"
  exit 1
fi
printf '\nall checks passed\n'
