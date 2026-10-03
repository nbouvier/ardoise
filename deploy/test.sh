#!/usr/bin/env bash
# Checks the order and the failure handling of deploy.sh and backup.sh against a
# stand-in for `docker` that records its calls. No Docker needed:
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
# $FAIL_ON, and prints something when asked to run pg_dump.
fresh_sandbox() {
  sandbox=$(mktemp -d)
  mkdir "$sandbox/bin"
  cp "$here/deploy.sh" "$here/backup.sh" "$here/lib.sh" "$sandbox/"
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
esac
SHIM
  chmod +x "$sandbox/bin/docker" "$sandbox/deploy.sh" "$sandbox/backup.sh"
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
  : > "$sandbox/backups/splitcount-202601${day}T000000Z.dump"
  touch -d "2026-01-$day" "$sandbox/backups/splitcount-202601${day}T000000Z.dump"
done
BACKUP_KEEP=3 "$sandbox/backup.sh" > /dev/null
check 'keeps the newest N' test "$(ls "$sandbox"/backups/*.dump | wc -l)" -eq 3
check 'drops the oldest' test ! -e "$sandbox/backups/splitcount-20260101T000000Z.dump"
check 'keeps the one just taken' bash -c 'ls "$1"/backups/*.dump | grep -qv 2026010' _ "$sandbox"

if [ "$failures" -ne 0 ]; then
  printf '\n%d check(s) failed\n' "$failures"
  exit 1
fi
printf '\nall checks passed\n'
