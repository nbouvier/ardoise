# HTTP API

Living document describing the current API surface of `apps/server`. Update it whenever a
route is added, changed or removed.

## Conventions

- REST over HTTP, JSON request and response bodies.
- Request and response shapes are validated with Zod on the server.
- Shared request/response types move into a `packages/*` workspace once the mobile client
  needs them (not yet created).
- Authentication: Google sign-in (planned). Protected routes will require a verified
  Google token; none exist yet.

## Base URL

- Local: `http://localhost:3000` (`PORT`, default `3000`).

## Endpoints

### `GET /health`

Liveness probe. No authentication. Dependency-free.

Response `200`:

```json
{ "status": "ok" }
```

## Planned

- Google sign-in / session establishment.
- Groups ("counts") CRUD.
- Expenses CRUD with split definitions.
- Balances / settle-up.
