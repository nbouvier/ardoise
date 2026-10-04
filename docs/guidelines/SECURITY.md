# Secrets and sensitive data guidelines

## Purpose

The repository is published on GitHub. Everything that reaches git or GitHub is public and
permanent: a pushed secret stays in forks, clones and caches even after it is deleted, so
it must be treated as compromised. These rules keep secrets and personal data out of the
repository entirely. They are not negotiable.

## What is sensitive

- **Credentials**: passwords, API keys, tokens, signing secrets — `AUTH_JWT_SECRET`,
  `POSTGRES_PASSWORD`, `DATABASE_URL` with its password, `EXPO_TOKEN`, GitHub tokens,
  Google OAuth client secrets, real access/refresh/ID tokens or JWTs from a session.
- **Keys and signing material**: SSH private keys, TLS keys (`*.pem`, `*.key`), Android
  keystores (`*.jks`, `*.keystore`), Apple keys (`*.p8`, `*.p12`), Google service account
  or Play publishing JSON files.
- **Infrastructure details**: real server IP addresses, SSH users, host keys and machine
  hostnames. The public API domain is not secret once published, but nothing else about
  the machines belongs in git.
- **Personal data**: real users' names, e-mail addresses, phone numbers and financial data
  (expenses, balances, bank details); anything from a local database (`.pglite/`) or a
  production backup; the maintainers' personal e-mail addresses and local paths
  (`C:\Users\<name>\…`, `/home/<name>/…`).
- **Google OAuth client IDs** are not secret in the strict sense (they ship inside the
  app), but they stay out of git like the rest of the configuration: they live in `.env`
  files.

`EXPO_PUBLIC_*` variables are bundled into the mobile app and readable by anyone who has
it: they must never hold a secret (see "Configuration" in `CLAUDE.md`).

## Where real values live

| Context | Location | In git |
| --- | --- | --- |
| Local development | `apps/server/.env`, `apps/mobile/.env` | never (ignored) |
| CI | GitHub secrets | never |

Only the `.env.example` files are committed, with placeholders.

## Rules

1. **Never commit a real value.** Use placeholders that are obviously fake:
   `change-me-to-a-long-random-string`, `xxxx-web.apps.googleusercontent.com`, domains
   under `example.com` or `.test`, documentation IP ranges (`192.0.2.0/24`,
   `198.51.100.0/24`, `203.0.113.0/24`), `@example.com` e-mail addresses, test secrets
   named as such (`test-secret-at-least-16-chars-long`).
2. **The rule covers everything git or GitHub sees**: code, tests, fixtures, snapshots,
   docs, comments, commit messages, pull request descriptions, issues, screenshots, CI
   logs. It applies on local branches too: a commit can be pushed later by accident.
3. **New configuration value**: read it through the app's `config/` module, add it to the
   matching `.env.example` with a placeholder, document it. Never put a real secret as a
   default in code.
4. **New kind of credential file**: add its pattern to `.gitignore` before the file is
   created, not after.
5. **CI workflows**: secrets come only from `secrets.*`; never `echo` them, never run
   `set -x` around them, never pass them as command-line arguments visible in logs. Do not
   use `pull_request_target`: pull requests from forks must never reach a secret.
6. **Screenshots and pasted logs** (docs, issues, pull requests): crop or redact tokens,
   e-mail addresses, real names and real amounts.
7. **Handling secrets while working**: do not print secret values to a terminal, a log or
   a conversation. To check whether a value leaked, compare it programmatically and print
   only the result.
8. **Before each commit**, review the staged diff (`git diff --cached`) for any of the
   above. The CI scan is a safety net, not the first line.

## If a secret leaks

1. **Stop.** Do not push. Tell the people responsible for the repository immediately.
2. **Not pushed yet**: remove it from the local history (amend or rewrite the unpushed
   commits) and move the value to its proper place.
3. **Already pushed**: the secret is compromised. **Revoke or rotate it first** — cleaning
   the history afterwards (`git filter-repo`) is secondary and never sufficient alone.

| Secret | Rotation |
| --- | --- |
| `AUTH_JWT_SECRET` | New random value in the server `.env`, redeploy (signs every user out) |
| Google OAuth client | Delete and recreate it in Google Cloud Console, update the `.env` files |
| GitHub token | Revoke it in GitHub settings |

## Automated checks

- **CI**: the `secrets` job in `.github/workflows/ci.yml` runs
  [gitleaks](https://github.com/gitleaks/gitleaks) over the whole git history on every pull
  request and every push to `main`.
- **GitHub**: secret scanning and push protection must be enabled in the repository
  settings (Settings → Code security). Push protection rejects a push containing a known
  secret format before it is published.
- **False positives**: a finding is allowlisted (in `.gitleaks.toml`) only after checking
  that the value is fake, with a comment saying why. Never weaken or skip the scan to make
  CI pass.
