# Testing strategy

## Goal

Use the smallest test suite that provides strong behavioral confidence. Acceptance criteria define the minimum behavior to verify; the implementation context may justify additional tests for edge cases, failures, boundaries, concurrency, invalid states, likely regressions or security-sensitive behavior.

## Test levels

### Unit
Use for non-trivial isolated business logic, validation, transformations, calculations, authorization rules and state machines. Test behavior rather than implementation details.

### Integration
Prefer for behavior spanning multiple application layers such as UI + state, cache + mutation, repository + persistence, or authentication + authorization. Mock external boundaries rather than every internal dependency.

### E2E
Reserve for critical user journeys such as authentication, onboarding, payment, the primary business workflow and destructive account operations.

### Visual / human validation
Use screenshot comparison, visual regression or explicit human validation when a criterion depends on rendered appearance or interaction quality that ordinary tests cannot reliably capture.

## Feature workflow

Before implementation:
1. map every acceptance criterion to a verification method;
2. choose the lowest useful test level;
3. identify important additional risk cases;
4. review the test plan with the implementation plan.

During implementation, run targeted tests. Before completion, run the relevant feature suite plus project-wide lint/typecheck/build checks.

## Bug workflow

For reproducible bugs, add a regression test before the fix whenever practical. Confirm it fails on the buggy implementation, implement the smallest fix, then confirm the test and related suite pass.

## Existing tests

Never change an existing test solely to make new code pass. Determine whether the implementation regressed or the expected product behavior intentionally changed. Update a test only when the expected behavior changed intentionally.

## Coverage

Coverage is a diagnostic metric, not the primary objective. Untested critical logic is a problem; low-value tests written only to increase coverage are also a problem.

## Determinism

Control time, randomness, network, database state and external services when needed. Flaky tests reduce the value of automated agent validation.
