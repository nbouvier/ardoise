# Operations

Living document. How the API server is hosted and operated: the layout of a machine, how
a release reaches it, backups, rollbacks. What the *server process* needs (environment
variables, proxy, shutdown…) is in `docs/DEPLOYMENT.md`; the schema is in
`docs/DATABASE.md`. The mobile builds are in `docs/MOBILE.md`.

Everything here assumes one Linux machine (a VPS) with Docker (Compose v2) and is
provider-independent: anyone can self-host the same stack.

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
| Directory on the machine | `/opt/splitcount/production` | `/opt/splitcount/staging` |
| Compose project | `splitcount-production` | `splitcount-staging` |
| Host port (loopback) | 3000 | 3001 |
| Domain | `PRODUCTION_DOMAIN` | `STAGING_DOMAIN` |
| Receives a release | when someone promotes it (manual) | on every merge to `main` |
| Data | real | disposable test data, never real users |

The two environments share only the machine and the proxy. They can be moved to separate
machines without changing anything but the Caddyfile (each machine then runs one of the
two sites).

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
   the second line.
4. **DNS**: an A record (and AAAA if the machine has IPv6) for each domain pointing at the
   machine. Without a domain the proxy cannot obtain a certificate, and Android refuses
   cleartext HTTP, so there is no useful deployment without one.
5. **The directories**, owned by the deploy user:
   `/opt/splitcount/{proxy,production,staging}`.
6. **The proxy**: copy `deploy/proxy/` to `/opt/splitcount/proxy`, create its `.env` from
   `.env.example`, then `docker compose up -d`. Only if its Caddyfile or compose file
   changes does it need touching again (it is not part of a release).
7. **Per environment, the `.env`** — copy `deploy/.env.example` to
   `/opt/splitcount/<env>/.env`, fill it, `chmod 600`. It holds every secret of the
   environment and **exists only there**: it is not in git and not in the CI. Generate
   the secrets on the machine:
   ```bash
   openssl rand -hex 24      # POSTGRES_PASSWORD
   openssl rand -base64 48   # AUTH_JWT_SECRET
   ```
   Production and staging must have different `POSTGRES_PASSWORD` and `AUTH_JWT_SECRET`,
   and different `SERVER_PORT` (3000 / 3001, matching the Caddyfile).

The scripts (`deploy.sh`, `backup.sh`, `compose.sh`, `lib.sh`, `compose.yaml`) are **not**
installed by hand: every deploy copies them from the repository into the environment's
directory, so what runs on the machine is what is in git.

## Deploying

```bash
cd /opt/splitcount/<env>
./deploy.sh ghcr.io/<owner>/splitcount-server:sha-1a2b3c4
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

merge to main ─► secrets + verify ─► image (published: ghcr.io/<owner>/splitcount-server:sha-<7>)
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
(`splitcount-server`, under the account's Packages) is **private** and linked to the
repository, so the job token can read it. Use repository-level secrets instead if
staging and production share a machine and you prefer one copy.

If a secret or variable is missing the job fails at the SSH step with an empty host:
that is the symptom of an unconfigured environment.

In **Settings → Code security**, enable **Secret scanning** and **Push protection**: a push
containing a known secret format is then rejected before it is published. The CI
`secrets` job (gitleaks) is the second net; see `docs/guidelines/SECURITY.md`.

## Rolling back

```bash
cd /opt/splitcount/production
cat release.env                 # the current release
./deploy.sh ghcr.io/<owner>/splitcount-server:sha-<previous>
```

That is the same procedure with an older image: it takes a backup, runs that image's
migrations (none to apply — the database is ahead), starts it. It only works if the
newer release's migrations kept the older code working (expand/contract, see
`docs/DATABASE.md`). If one did not, restore the pre-release backup instead (below) —
which also loses whatever was written since.

Images stay on the machine and in the registry; the registry keeps the `sha-…` tags.

## Backups

`backup.sh` writes `backups/splitcount-<UTC timestamp>.dump` (PostgreSQL custom format)
and keeps the newest `BACKUP_KEEP` (default 30). Taken **automatically before every
deploy**; also schedule one daily, as the deploy user (`crontab -e`):

```cron
15 3 * * * /opt/splitcount/production/backup.sh >> /opt/splitcount/production/backups/cron.log 2>&1
```

**A dump on the machine's own disk does not survive losing the machine** (provider
incident, deleted VPS, ransomware), so it is copied off the machine on a schedule. The
reference deployment sends its backups to S3-compatible object storage located in Europe
(the provider's backup service, or `rclone` / `rsync` to a bucket or another host when
self-hosting elsewhere). Whatever the mechanism, check that the copy **includes
`backups/`** and runs after the daily dump. The dumps contain every user's email and
name: keep the destination private and encrypted.

### Restoring

```bash
cd /opt/splitcount/production
./compose.sh stop server
./compose.sh exec -T db pg_restore --username splitcount --dbname splitcount \
  --clean --if-exists --no-owner < backups/splitcount-<timestamp>.dump
./compose.sh start server
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
| `.env` of an environment | that environment's directory, mode 600 | Edit, then `./compose.sh up -d server` (recreates the container with the new values). Changing `AUTH_JWT_SECRET` signs every user out. Changing `POSTGRES_PASSWORD` here does not change it *inside* an existing database: alter the role first (`./compose.sh exec db psql -U splitcount -c "alter user splitcount password '…'"`), then edit. |
| Google OAuth client IDs | `GOOGLE_CLIENT_IDS` | Public identifiers, not secrets. |
| CI → machine SSH key | repository secrets (see "Automated deploys") | Generate a new pair, replace the public key in `authorized_keys`, then the secret. |

Nothing secret is in git, in an image, or in a build log. The mobile app holds no server
secret (`docs/MOBILE.md`).

## Known limits

- Single machine, single database: no replication, no automatic failover. The database
  runs in a container with a named volume on the machine's disk.
- No zero-downtime deploys (above).
- No uptime monitor or alerting yet (above).
- Rate-limit counters are per process (`docs/DEPLOYMENT.md`).
