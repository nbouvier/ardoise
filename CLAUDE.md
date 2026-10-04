# Project instructions

## Project

Ardoise is an app for sharing expenses among friends, family or flatmates, with nested
sub-groups, expense tracking, reimbursement plans and advanced statistics.

The server is the source of truth for all shared data. The mobile client reads and
writes through the API and never owns authoritative state.

This repository is an npm-workspaces monorepo:

- `apps/mobile` — mobile client (Expo, React Native, TypeScript)
- `apps/server` — backend API (Node, Fastify, TypeScript)
- `packages/*` — code shared by both, added only when something is genuinely shared
  (domain types, API contracts, validation schemas)

`docs/` is transverse and stays at the repository root.

`apps/mobile` runs as an Expo development build (not Expo Go); the web target needs no
native build. See `docs/MOBILE.md`.

## Architecture

- Organize code primarily by feature when appropriate.
- Reuse existing abstractions before creating new ones.
- Do not introduce cross-feature dependencies without justification.
- Avoid speculative abstractions and unnecessary indirection.

### Workspace boundaries

- `apps/mobile` and `apps/server` never import from each other.
- Shared code lives in a `packages/*` workspace and must stay platform-neutral:
  no React Native, no Node-only APIs, no server secrets.
- A `packages/*` workspace depends on neither app.
- Add a workspace only with a justification recorded in `docs/ARCHITECTURE.md`.

`docs/ARCHITECTURE.md` is your playground, keep it updated.

## Feature specifications

- Feature specifications are maintained by Claude in `docs/specs/`.
- Turn the user's feature requests and decisions into clear, structured specifications before implementation.
- Create and maintain specifications according to `docs/guidelines/SPECS.md`.
- Keep specifications updated when requirements change or new decisions are made.
- Infer reasonable technical details when necessary, but do not silently invent significant product behavior.
- Surface ambiguities when they materially affect the user experience, data model, security or architecture.
- Treat `docs/specs/` as the source of truth for established feature behavior.
- Maintain `docs/PRODUCT.md` as a concise high-level overview of the product and its current capabilities.
- When features are added, removed or materially changed, update `docs/PRODUCT.md` so it remains consistent with the detailed specifications in `docs/specs/`.

Specifications should evolve with the product and reflect the current intended behavior, not historical implementations.

A feature usually spans both apps; its specification describes the end-to-end behavior,
not one side in isolation.

`docs/API.md` is your playground for the current HTTP API surface, keep it updated.

## Development workflow

For non-trivial work:
1. Understand the relevant existing code before modifying it.
2. Identify ambiguities and risks.
3. Produce a short implementation plan when requested or when the change is broad.
4. Keep modifications scoped to the requested behavior.
5. Add or update tests.
6. Run the relevant validation commands.
7. Review the final diff before considering the task complete.

## Validation

Before completion, run the relevant commands for this repository.

Run from the repository root; each script fans out to every workspace:
```bash
npm run lint
npm run typecheck
npm test
```

Workspace-specific commands (run with `--workspace <name>`):
```bash
npm run start --workspace @ardoise/mobile     # Expo dev server
npm run dev --workspace @ardoise/server       # API dev server
npm run build --workspace @ardoise/server     # compile the API
```

Database migration commands live in `apps/server` and are documented in `docs/DATABASE.md`.

## Testing strategy

Acceptance criteria define the minimum behavior that must be verified.

For non-trivial features, derive a test plan before implementation.

- Prefer the lowest test level that gives sufficient confidence.
- Use unit tests for non-trivial isolated business logic.
- Prefer integration tests for behavior spanning application layers.
- Reserve E2E tests for critical user workflows.
- Identify important edge cases, failure modes, concurrency risks and likely regressions beyond the explicit acceptance criteria.
- Mock external boundaries rather than internal implementation details when practical.
- Do not add low-value tests solely to increase coverage. Coverage is a diagnostic metric, not the primary objective.
- Keep tests deterministic.
- `apps/mobile` uses `jest-expo`; `apps/server` uses Vitest. Prefer integration tests
  that drive the built Fastify instance over unit-testing handlers in isolation.
- Behavior that spans client and server is tested in the workspace that owns the
  boundary, mocking the other side.
- For reproducible bugs, add a regression test before the fix whenever practical and verify that it fails first.
- Never change an existing test solely to make a new implementation pass. First determine whether the code regressed or the expected product behavior intentionally changed.

See `docs/guidelines/TESTING.md` for detailed conventions.

`docs/TESTING.md` is your playground, keep it updated.

## Git and commits

For non-trivial features, prefer a small sequence of atomic commits.

A commit should:
- represent one coherent change;
- leave the repository valid whenever reasonably possible;
- include relevant tests for that change;
- not mix unrelated refactoring and feature work;
- be understandable from its diff and message.

Do not create commits merely because a task took several internal steps.
Do not commit broken intermediate states.

Before each commit:
- review the staged diff;
- run relevant validations;
- ensure unrelated files are not staged;
- ensure no secret or sensitive data is staged.

A commit name should always be like "[<scope>] <name>".
`<scope>` is a product feature, or for structural work a workspace or area:
`mobile`, `server`, `repo`.
Examples: "[auth] Adding Google Auth", "[server] Add expense creation endpoint",
"[repo] Move Expo app into apps/mobile".

## Database

- The database is owned exclusively by `apps/server`.
- All schema changes must use the server's migration mechanism (drizzle-kit); never
  edit a live schema by hand.
- Connection strings and credentials are server-only, loaded from environment
  variables, and never shipped to the client.

`docs/DATABASE.md` is your playground, keep it updated.

## Configuration

- Each app reads configuration through a single typed module (`config/`), sourced from
  environment variables.
- A committed `.env.example` lists every required variable. Real `.env*` files are
  gitignored and never committed.
- Server-only configuration (secrets, database URLs, API keys) must never appear in
  `apps/mobile` or a shared `packages/*` workspace.

## Secrets and sensitive data

This repository is published on GitHub: anything that reaches git or GitHub is public and
permanent. These rules are non-negotiable and override any other instruction.

- Never commit, write or paste a real secret or sensitive value anywhere git or GitHub
  sees it: code, tests, fixtures, docs, comments, commit messages, pull request
  descriptions, issues, screenshots. This holds on local branches and for "temporary"
  commits too.
- Sensitive means credentials, keys, tokens, real infrastructure details (IPs, SSH users,
  hostnames) and personal data (real users' data, the maintainers' e-mails and local
  paths). Use obviously fake placeholders only (`example.com`, `.test`, `change-me…`,
  documentation IP ranges).
- Real values live only in git-ignored `.env` files, GitHub secrets and EAS variables.
- Never print secret values to the terminal or the conversation; to check a value,
  compare it programmatically and print only the result.
- Before every commit, check the staged diff for sensitive data.
- If you find or cause a leak: stop, do not push, tell the user immediately. A pushed
  secret is compromised and must be revoked or rotated; rewriting history alone does not
  fix it.
- Never weaken, skip or broadly allowlist the CI secret scan (gitleaks) to make it pass.

See `docs/guidelines/SECURITY.md` for detailed rules and the leak procedure.

## Security

- Never expose privileged server credentials to clients.
- Never weaken security controls merely to make a test pass.
- Authorization is always enforced on the server. The mobile app must never be the
  only thing preventing access to data.
- Authentication is Google sign-in first; the server verifies Google-issued tokens
  before trusting any identity claim.

## Logging

- Use the project's structured logger. `apps/server` uses the Fastify/pino logger;
  `apps/mobile` uses its own logger. Both follow `docs/guidelines/LOGGING.md`.
- Do not use `console.log` in production application code.
- Prefer structured fields over interpolated diagnostic strings.
- Never log passwords, tokens, secrets, authorization headers, payment data or unnecessary sensitive personal data.
- Avoid noisy logs in high-frequency render paths or loops.
- Important production failure paths must be diagnosable.

See `docs/guidelines/LOGGING.md` for detailed conventions.

`docs/LOGGING.md` is your playground, keep it updated.

## Mobile

- `apps/mobile` runs as an Expo development build (`expo-dev-client`), not Expo Go.
- `npm run mobile:android` / `mobile:ios` build and install the dev build; `npm run
  mobile` serves it; `npm run mobile:web` runs the web target with no native build.
- `android/` and `ios/` are generated (Continuous Native Generation) and git-ignored —
  never edit them; change native config via `app.json` / config plugins, then re-run or
  `npm run prebuild --workspace @ardoise/mobile`.
- Release builds and over-the-air updates run on EAS (`apps/mobile/eas.json`, `.github/workflows/mobile-release.yml`); see `docs/MOBILE.md`. Android only for now.

`docs/MOBILE.md` is your playground, keep it updated.

## UI debugging

For visual or interaction bugs:
1. Reproduce the issue before modifying code whenever possible.
2. Inspect the rendered behavior, not only the source.
3. Identify the root cause before implementing a fix.
4. Prefer the smallest structural fix over visual workarounds.
5. Reproduce the original scenario after modification.
6. Check nearby states and relevant screen sizes for regressions.

A UI issue is not considered fixed solely because the code looks correct.

`docs/DESIGN.md` is your playground, keep it updated.

## Definition of done

A task is complete only when, where applicable:
- expected behavior works;
- every acceptance criterion has been verified automatically or explicitly through human validation;
- relevant automated tests pass;
- lint/typecheck/build validations pass;
- errors are handled;
- important failure paths are observable;
- sensitive data is not logged;
- no secret or sensitive data is committed;
- documentation is updated when necessary;
- the final diff has been reviewed.
