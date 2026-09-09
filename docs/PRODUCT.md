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

- **Authentication** — Google sign-in. Users sign in with their Google account and stay
  signed in across app launches (rotating refresh-token session); the server verifies
  every Google token before trusting an identity. See `docs/specs/authentication.md`.

Otherwise the project is still at an early stage: monorepo, mobile skeleton, an API with
`/health` and the auth endpoints, tooling and documentation.

## Planned direction

- Groups / "counts" bundling participants and expenses.
- Expense entry with flexible splitting between participants.
- Running balances and settle-up suggestions.
- Better tracking and organisation than Tricount (categories, history, clarity).

## Not yet decided

- Whether non-authenticated, link-based group access is offered later.
- Offline support (the current model is online, server-authoritative).

## Feature specifications

See `docs/specs/` for the authoritative behaviour of each feature as it is defined.
