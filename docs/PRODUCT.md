# SplitCount — product overview

Concise, high-level view of the product and its current capabilities. Detailed behaviour
lives in `docs/specs/`.

## Vision

Ease expense sharing between people. Positioned as a successor to Tricount, with stronger
organisation and better expense tracking.

## Target users

Groups who share costs: flatmates, trips, couples, recurring social groups.

## Shape of the product

- A mobile client (Expo / React Native).
- A backend API (Node) that is the source of truth for all shared data.
- Users sign in; groups and expenses live on the server and sync to each member's device.

## Current capabilities

None shipped yet. The project is at initial scaffold stage: monorepo, mobile skeleton,
a minimal API (`/health`), tooling and documentation.

## Planned direction

- **Authentication** — Google sign-in first. The server verifies Google-issued tokens.
- Groups / "counts" bundling participants and expenses.
- Expense entry with flexible splitting between participants.
- Running balances and settle-up suggestions.
- Better tracking and organisation than Tricount (categories, history, clarity).

## Not yet decided

- Whether non-authenticated, link-based group access is offered later.
- Offline support (the current model is online, server-authoritative).

## Feature specifications

See `docs/specs/` for the authoritative behaviour of each feature as it is defined.
