# Observability conventions

## Goals
Logs and errors should make production failures diagnosable without exposing sensitive data or flooding the logging backend.

## Logger
Use one centralized structured logger. Application code should not use ad-hoc `console.log` calls.

## Levels

### DEBUG
Detailed diagnostic information. Usually disabled or sampled in production.

### INFO
Meaningful lifecycle or business events, not every function call.
Examples: session restored, sync completed, push registration completed.

### WARN
Recoverable abnormal situation.
Examples: retry performed, stale cache used, optional integration unavailable.

### ERROR
An important operation failed and should be investigated.

## Event naming
Prefer stable event names such as:

```text
restaurant.load.failed
session.restore.completed
sync.retry.scheduled
```

## Structured context
Where useful include fields such as:
- `requestId` / correlation id;
- opaque internal `userId`;
- feature;
- operation;
- `durationMs`;
- error code;
- retry count.

## Errors
Serialize errors consistently. Preserve useful error type/code/cause without dumping arbitrary sensitive payloads.

## Sensitive information
Never log:
- passwords;
- access/refresh tokens;
- cookies;
- authorization headers;
- secrets or private keys;
- payment details;
- unnecessary sensitive personal information.

## Noise control
Do not emit successful logs from high-frequency render paths, tight loops or very common UI interactions unless explicitly required and sampled.

## Ownership
Log an error at the boundary where it becomes operationally meaningful. Avoid logging the same failure independently at every stack layer.

## Feature requirements
Important integrations and asynchronous workflows should define their observability requirements in their feature spec.
