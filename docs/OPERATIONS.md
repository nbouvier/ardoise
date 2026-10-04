# Operations

Living document. How the API server is hosted and operated: the layout of a machine, how
a release reaches it, backups, rollbacks. What the *server process* needs (environment
variables, proxy, shutdown…) is in `docs/DEPLOYMENT.md`; the schema is in
`docs/DATABASE.md`. The mobile builds are in `docs/MOBILE.md`.

Everything here assumes one Linux machine (a VPS) with Docker (Compose v2) and is
provider-independent: anyone can self-host the same stack. The machine can be x86-64 or
ARM64: the CI publishes the image for both (`linux/amd64`, `linux/arm64`) under one tag,
and Docker pulls the one matching the machine.

**Names.** The product is being renamed Ardoise; the code still says SplitCount. Everything
named on the machine and in the registry already uses `ardoise` (directories, Compose
projects and so their volumes, the database role, the image, the backups), because those
names are fixed by the first deploy: renaming them later means moving data.

## Topology

```
              Internet
                 │ 80/443
          ┌──────▼──────┐   Caddy: HTTPS certificates, one site per environment
          │   proxy     │   (deploy/proxy/)
          └──┬───────┬──┘
   127.0.0.1:3000   127.0.0.1:3001      loopback only
      ┌──────▼──┐  ┌──▼───────┐
      │production│  │ staging  │      two independent Compose projects (deploy/compose.yaml)
      │ server   │  │ server   │
      │ postgres │  │ postgres │      each with its own database volume
      └──────────┘  └──────────┘
```

| | production | staging |
| --- | --- | --- |
| Directory on the machine | `/opt/ardoise/production` | `/opt/ardoise/staging` |
| Compose project | `ardoise-production` | `ardoise-staging` |
| Host port (loopback) | 3000 | 3001 |
| Domain | `PRODUCTION_DOMAIN` | `STAGING_DOMAIN` |
| Receives a release | when someone promotes it (manual) | on every merge to `main` |
| Data | real | disposable test data, never real users |

The two environments share only the machine and the proxy. They can be moved to separate
machines without changing anything but the Caddyfile (each machine then runs one of the
two sites).

**Memory.** Every container has a ceiling, so a leak or a runaway query in one cannot
starve the others (staging cannot take production down with it). Past its ceiling a
container is killed and restarted by Docker; the others carry on. Per environment, in its
`.env`: `DB_MEMORY_LIMIT` (default `1g`) and `SERVER_MEMORY_LIMIT` (default `512m`, also
used by the migration step; Node sizes its heap from it). The proxy has a fixed `256m`.
Both environments at the defaults plus the proxy need about 3.3 GB: size the machine for
that, or lower staging's. A container restarting in a loop (`./compose.sh ps`, and
`OOMKilled` in `docker inspect`) means its ceiling is too low.

Staging exists so that a change (including its migration) runs once somewhere that does
not matter before it reaches production. The **same image** is promoted: production
deploys the image staging already ran, it is never rebuilt.

## What a machine needs, once

1. **Docker Engine with the Compose plugin** (the distribution's install script or the
   official apt repository).
2. **An unprivileged user** that the CI logs in as, member of the `docker` group (which
   is root-equivalent: use a key dedicated to the CI, nothing else on that user).
3. **A firewall**: only 22, 80 and 443 open. The database and the server ports are
   already bound to loopback / the internal network by the compose files; the firewall is
   the second line. Cloud machines often filter twice: the provider's network rules and
   the image's own iptables. Some images end the `INPUT` chain with a `REJECT` rule, and
   an `ACCEPT` appended after it never matches — insert before it
   (`iptables -L INPUT -n --line-numbers`, then `iptables -I INPUT <its number> -p tcp
   --dport 443 -j ACCEPT`, same for 80) and make it persistent (`netfilter-persistent
   save` or the image's equivalent; check no `DOCKER` chain ends up in the saved file).
4. **DNS**: an A record (and AAAA if the machine has IPv6) for each domain pointing at the
   machine. Without a domain the proxy cannot obtain a certificate, and Android refuses
   cleartext HTTP, so there is no useful deployment without one.
5. **The directories**, owned by the deploy user:
   `/opt/ardoise/{proxy,production,staging}`.
6. **The proxy**: copy `deploy/proxy/` to `/opt/ardoise/proxy`, create its `.env` from
   `.env.example`, then `docker compose up -d`. Only if its Caddyfile or compose file
   changes does it need touching again (it is not part of a release). Check its logs
   (`docker compose logs caddy`) for `certificate obtained` for each domain; then
   `http://<domain>` answers a redirect and `https://<domain>/health` a 502 until the
   environment is deployed. `Error getting validation data` means the certificate
   authority cannot reach ports 80/443 (firewall, DNS): **stop the proxy** while you fix
   it, Let's Encrypt allows only 5 failed validations per domain per hour.
7. **Per environment, the `.env`** — copy `deploy/.env.example` to
   `/opt/ardoise/<env>/.env`, fill it, `chmod 600`. It holds every secret of the
   environment and **exists only there**: it is not in git and not in the CI. Generate
   the secrets on the machine:
   ```bash
   openssl rand -hex 24      # POSTGRES_PASSWORD
   openssl rand -base64 48   # AUTH_JWT_SECRET
   ```
   Production and staging must have different `POSTGRES_PASSWORD` and `AUTH_JWT_SECRET`,
   and different `SERVER_PORT` (3000 / 3001, matching the Caddyfile).
8. **Off-site backups** (production): `backup-offsite.env` and the daily cron, see
   "Backups" below.

The scripts (`deploy.sh`, `backup.sh`, `backup-offsite.sh`, `compose.sh`, `lib.sh`,
`compose.yaml`) are **not**
installed by hand: every deploy copies them from the repository into the environment's
directory, so what runs on the machine is what is in git.

The commands in this document run **as the deploy user**. Administering from another
account (one with sudo), prefix them with `sudo -u deploy` (`sudo -u deploy ./compose.sh
ps`, `sudo -u deploy crontab -e`, `sudo -u deploy nano .env`): the env files are mode
600 and must stay owned by the deploy user, or the next deploy cannot read them.

## Deploying

```bash
cd /opt/ardoise/<env>
./deploy.sh ghcr.io/<owner>/ardoise-server:sha-1a2b3c4
```

(The CI does exactly that over SSH; run it by hand to redeploy or roll back.) In order:

1. **Pull** the image.
2. **Start the database** and wait until it is healthy (a no-op once it runs).
3. **Back up** the database to `backups/` — the migrations are not reversible, this dump is
   the way back from a bad one.
4. **Migrate**, once: `docker compose run --rm migrate`. A failure stops the deploy here;
   the running server was not touched.
5. **Start the new server** and wait for its healthcheck. If it never becomes healthy the
   previous image is started again and the script exits 1. The database stays ahead of
   the old image; the server accepts that (see "Database migrations" in
   `docs/DEPLOYMENT.md`).
6. Record the release in `release.env` (the image `compose.sh` and the next deploy treat
   as current).

Only one deploy runs at a time (`.deploy.lock`); a second one refuses to start. If a
deploy was killed hard and left the lock behind, remove the `.deploy.lock` directory.

`./compose.sh` is `docker compose` with this environment's `.env` and release:
`./compose.sh ps`, `./compose.sh logs -f server`.

**Downtime.** One server container per environment: replacing it costs a few seconds of
refused connections (the old one drains its requests first, the new one must pass its
healthcheck). Acceptable for now; zero-downtime would need two replicas behind the proxy,
which the per-instance rate limits (`docs/DEPLOYMENT.md`) already tolerate.

## Automated deploys (GitHub Actions)

```
pull request ──► secrets (gitleaks) + verify (lint, typecheck, tests, deploy scripts, compose files)
                 └─► image (built, not published)

merge to main ─► secrets + verify ─► image (published: ghcr.io/<owner>/ardoise-server:sha-<7>)
                                     └─► deploy-staging ─► smoke test (GET <staging>/health)

"Deploy to production" (Actions tab, by hand, image_tag = sha-<7>)
                  └─► [reviewer approves] ─► deploy ─► smoke test
```

`.github/workflows/ci.yml` does the first two; `deploy-production.yml` the last. Both
deploy through the composite action `.github/actions/deploy`: it copies the scripts to
the environment's directory, logs the machine into GHCR with the job's own short-lived
token (and logs out again), and runs `deploy.sh` over SSH.

Production never builds: you give it the `sha-…` tag shown in the `image` job of a
staging run that you have looked at, and it deploys those exact bytes. The tag is
checked (`sha-` + hex) before use. The scripts it syncs are those of the branch you run
the workflow on — main, normally.

### GitHub configuration (once)

In the repository's **Settings → Environments**, create `staging` and `production`. In
each:

| Kind | Name | Value |
| --- | --- | --- |
| secret | `DEPLOY_HOST` | the machine's address |
| secret | `DEPLOY_USER` | the deploy user |
| secret | `DEPLOY_SSH_KEY` | the private key of a key pair generated for the CI only (`ssh-keygen -t ed25519 -N ''`); the public half goes in that user's `authorized_keys` |
| secret | `DEPLOY_KNOWN_HOSTS` | the machine's host key: run `ssh-keyscan -t ed25519 <host>` **from a network you trust and compare the fingerprint with the provider's console** — the deploy refuses any other key, which is what protects the registry token |
| variable | `PUBLIC_URL` | `https://<that environment's domain>` (no trailing slash), used for the smoke test |

On `production`, enable **Required reviewers** (yourself is fine for a solo project: it
turns a stray click into a deliberate second one) and restrict it to the `main` branch.
On the repository: after the first image is published, check the package
(`ardoise-server`, in the repository's sidebar under Packages) is linked to the
repository, so the job token can read it. It takes the repository's visibility — public
here, which is harmless: the image holds the public code and no secret. Use
repository-level secrets instead if staging and production share a machine and you
prefer one copy.

If a secret or variable is missing the job fails at the SSH step with an empty host:
that is the symptom of an unconfigured environment.

In **Settings → Code security**, enable **Secret scanning** and **Push protection**: a push
containing a known secret format is then rejected before it is published. The CI
`secrets` job (gitleaks) is the second net; see `docs/guidelines/SECURITY.md`.

## Rolling back

```bash
cd /opt/ardoise/production
cat release.env                 # the current release
./deploy.sh ghcr.io/<owner>/ardoise-server:sha-<previous>
```

That is the same procedure with an older image: it takes a backup, runs that image's
migrations (none to apply — the database is ahead), starts it. It only works if the
newer release's migrations kept the older code working (expand/contract, see
`docs/DATABASE.md`). If one did not, restore the pre-release backup instead (below) —
which also loses whatever was written since.

Images stay on the machine and in the registry; the registry keeps the `sha-…` tags.

## Backups

Two layers:

- **On the machine.** `backup.sh` writes `backups/ardoise-<UTC timestamp>.dump`
  (PostgreSQL custom format) and keeps the newest `BACKUP_KEEP` (default 30). Taken
  **automatically before every deploy**: the way back from a bad migration.
- **Off the machine, daily.** A dump on the machine's own disk does not survive losing the
  machine (provider incident, deleted VPS, ransomware). `backup-offsite.sh` runs
  `backup.sh`, sends the new dump to a [restic](https://restic.net) repository in
  S3-compatible object storage (the reference deployment uses a bucket in Europe), then
  applies the retention there: **30 daily, 12 monthly**. restic encrypts everything
  before it leaves the machine, which matters: the dumps hold every user's e-mail, name
  and expenses. restic runs from its official image (`restic/restic`, version pinned in
  the script): nothing to install.

### Setting up the off-site copy (production, once)

1. A **private bucket** and an access key limited to it. A **restic repository** in it:
   from any computer with restic, `restic init` with the variables of
   `deploy/backup-offsite.env.example`. Keep
   `RESTIC_PASSWORD` in a password manager too: without it every backup is unreadable.
2. On the machine, `backup-offsite.env` next to the scripts, from
   `deploy/backup-offsite.env.example`, `chmod 600`.
3. A **check at a cron monitor** (healthchecks.io or anything speaking its protocol):
   period 1 day, grace 1 hour. Its ping URL is `PING_URL` in `backup-offsite.env`. The
   script pings `/start`, then the URL on success or `/fail` on failure; the monitor
   alerts on a failure, and on silence — a cron that stopped, a machine that is gone, a
   run stuck past the grace time.
4. The cron, as the deploy user (`crontab -e`), away from any automatic-reboot window of
   the machine (minimal images may not ship cron: install and enable it, e.g. `apt
   install cron`, `systemctl enable --now cron`; it runs in the machine's time zone):
   ```cron
   15 3 * * * /opt/ardoise/production/backup-offsite.sh >> /opt/ardoise/production/backups/cron.log 2>&1
   ```
5. Run it once by hand, check the monitor turned green, then **restore from the bucket**
   (below).

Staging holds disposable data: its pre-deploy dumps are enough.

Each snapshot holds one dump, named `/ardoise.dump`, under the host
`ardoise-<DEPLOY_ENV>`. To look at the repository from the machine:

```bash
cd /opt/ardoise/production
docker run --rm --env-file backup-offsite.env restic/restic:0.18.0 snapshots
```

If the storage is unreachable, restic retries for about 15 minutes, then the run fails
(and the monitor says so). A run killed hard can leave a stale lock that makes the next
one fail: `… restic/restic:0.18.0 unlock`.

### Restoring

From a dump on the machine:

```bash
cd /opt/ardoise/production
./compose.sh stop server
./compose.sh exec -T db pg_restore --username ardoise --dbname ardoise \
  --clean --if-exists --no-owner < backups/ardoise-<timestamp>.dump
./compose.sh start server
```

From the off-site copy (the machine is new, or its dumps are gone): fetch the dump, then
the same commands with that file.

```bash
docker run --rm --env-file backup-offsite.env restic/restic:0.18.0 \
  dump --host ardoise-production latest /ardoise.dump > restored.dump
# an older one: `snapshots`, then `dump <snapshot id> /ardoise.dump`
```

Prefer to rehearse on staging first: copy a production dump there and restore it. **Test
a restore before you need one** — a backup nobody restored is a hope. Do it again after
any change to how backups are taken.

## Logs and monitoring

- The server logs JSON on stdout (`docs/LOGGING.md`): `./compose.sh logs -f server`.
  Docker keeps 5 × 10 MB per container, nothing more; there is **no log shipping** yet.
- `GET /health` answers `{"status":"ok"}`; it is what the container healthcheck uses.
  Point an external uptime monitor at `https://<domain>/health` — without one, the first
  report of an outage is a user. It does not check the database (by design: it must keep
  answering when the database is down).
- Events worth alerting on once there is somewhere to alert: `server.start.failed`,
  `db.pool.error` (repeated), `http.request.failed`, `server.shutdown.timeout`.

## Secrets and rotation

| Secret | Lives in | Rotating it |
| --- | --- | --- |
| `.env` of an environment | that environment's directory, mode 600 | Edit, then `./compose.sh up -d server` (recreates the container with the new values). Changing `AUTH_JWT_SECRET` signs every user out. Changing `POSTGRES_PASSWORD` here does not change it *inside* an existing database: alter the role first (`./compose.sh exec db psql -U ardoise -c "alter user ardoise password '…'"`), then edit. |
| Google OAuth client IDs | `GOOGLE_CLIENT_IDS` | Public identifiers, not secrets. |
| CI → machine SSH key | repository secrets (see "Automated deploys") | Generate a new pair, replace the public key in `authorized_keys`, then the secret. |
| `backup-offsite.env` | production's directory, mode 600; `RESTIC_PASSWORD` also in a password manager | Bucket key: create a new one, edit, revoke the old. `RESTIC_PASSWORD`: `restic key add` then `restic key remove` the old one (re-encrypting the data is not needed), then edit. |

Nothing secret is in git, in an image, or in a build log. The mobile app holds no server
secret (`docs/MOBILE.md`).

## Known limits

- Single machine, single database: no replication, no automatic failover. The database
  runs in a container with a named volume on the machine's disk.
- No zero-downtime deploys (above).
- Alerting comes only from outside: the uptime monitor on `/health` and the off-site
  backup's check. Nothing alerts on log events yet (above).
- The machine holds a bucket key that can delete as well as write (`restic forget
  --prune` needs it): whoever takes over the machine can erase the off-site copies too.
  Not solved yet; the candidates are an object lock / retention rule on the bucket, or
  pruning from another computer with a key the machine does not have.
- Rate-limit counters are per process (`docs/DEPLOYMENT.md`).
