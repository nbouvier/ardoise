#!/usr/bin/env bash
# `docker compose` for this environment, with its `.env` and the release that is
# deployed: ./compose.sh ps | logs -f server | exec db psql -U ardoise ...
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

compose "$@"
