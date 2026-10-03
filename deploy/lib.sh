# Shared by deploy.sh and backup.sh: sourced, never executed.
#
# Runs from the directory the scripts live in, which is also where `.env` and
# `compose.yaml` are on the server.

cd "$(dirname "${BASH_SOURCE[0]}")"

# The release deployed last, written by deploy.sh once it succeeded. An image
# already in the environment (deploy.sh sets one for the release it deploys) wins.
if [ -z "${SERVER_IMAGE:-}" ] && [ -f release.env ]; then
  SERVER_IMAGE=$(sed -n 's/^SERVER_IMAGE=//p' release.env)
fi
export SERVER_IMAGE="${SERVER_IMAGE:-}"

compose() {
  docker compose --env-file .env "$@"
}

log() {
  printf '%s %s: %s\n' "$(date -u +%FT%TZ)" "$(basename "$0")" "$*"
}
