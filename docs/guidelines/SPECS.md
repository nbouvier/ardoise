# Feature specification guidelines

Feature specifications describe the intended product behavior of a feature.

They are maintained by Claude in:

```text
docs/specs/
```

A specification should be created before implementing a meaningful new feature and updated whenever its intended behavior materially changes.

Specifications are product-oriented contracts, not implementation documentation.

They should explain **what the system must do and why**, while leaving implementation details to the code and architecture documentation unless those details are themselves requirements.

---

## General principles

A good specification should be:

* concise enough to read quickly;
* precise enough to remove meaningful ambiguity;
* focused on observable behavior;
* explicit about important edge cases;
* testable through its acceptance criteria;
* independent from unnecessary implementation details.

Do not make a specification artificially exhaustive.

Document what matters for understanding and validating the feature.

---

## Product decisions

Claude may infer reasonable details when they are obvious and low-impact.

Do not silently invent significant product behavior.

When missing information could materially affect:

* user experience;
* business rules;
* data ownership;
* permissions;
* security or privacy;
* destructive behavior;
* architecture;
* important future behavior;

add it to **Open questions** and surface it to the user before making the decision.

---

## Specification structure

Use the following structure for feature specifications.

# Feature: TODO

Use a short product-oriented feature name.

---

## Context

Explain briefly why the feature exists and what user or business problem it solves.

Focus on intent rather than implementation.

Example:

> Users frequently return to the same restaurants and need a simple way to find them again without searching.

---

## User story

Describe the primary user goal.

Use the format:

> As a **TODO**, I want **TODO**, so that **TODO**.

Multiple user stories may be used when the feature genuinely serves distinct user goals, but avoid unnecessary fragmentation.

---

## Expected behavior

Describe the important observable behavior of the feature.

* TODO
* TODO

Focus on what the user or system should observe.

Do not describe internal implementation unless it affects required behavior.

---

## Out of scope

Explicitly identify nearby functionality that is intentionally not part of this feature.

* TODO

This section is particularly useful for preventing scope creep during implementation.

Use `None` when there is nothing meaningful to clarify.

---

## Edge cases

List important non-happy-path situations that affect expected behavior.

Examples include:

* missing or invalid data;
* repeated actions;
* network failures;
* expired sessions;
* conflicting state;
* unavailable resources;
* partial failures;
* relevant concurrency situations.

Do not enumerate theoretical edge cases with negligible product value.

---

## Acceptance criteria

Define concrete conditions that must be true for the feature to be considered complete.

Each criterion should describe observable behavior and should be verifiable either automatically or through explicit human validation.

* [ ] TODO
* [ ] TODO

Avoid vague criteria such as:

> The feature works correctly.

Prefer:

> When an authenticated user favorites a restaurant, the restaurant appears as favorited after reopening the application.

Acceptance criteria are the minimum required behavior and form the basis of the implementation test plan.

---

## Testing considerations

Optional.

List only important testing risks, scenarios or constraints already known from the product requirements.

Claude must still derive the complete test plan from:

* the acceptance criteria;
* the implementation context;
* existing behavior;
* relevant failure modes;
* likely regressions.

Do not use this section as an exhaustive list of tests.

* TODO

Use `None` when there are no specific considerations.

---

## Data / API considerations

Document product-relevant data or API requirements when they exist.

Examples:

* data that must persist;
* ownership relationships;
* required external data;
* synchronization expectations;
* API behavior that forms part of the feature contract.

Avoid documenting low-level schemas or implementation details here.

Detailed database design belongs in `docs/DATABASE.md`.
Architectural decisions belong in `docs/ARCHITECTURE.md`.

Use `None` when not applicable.

---

## UX / UI considerations

Document important user experience or visual requirements specific to this feature.

Examples:

* required states;
* interaction behavior;
* responsive considerations;
* loading behavior;
* empty states;
* error feedback;
* accessibility requirements;
* important visual constraints.

General visual conventions belong in `docs/DESIGN.md` and should not be duplicated here.

Use `None` when the feature has no specific UI requirements.

---

## Observability

Describe failures or important operations that must be diagnosable in production.

Focus on operational requirements rather than exact log statements.

Examples:

* failure to synchronize user data must be diagnosable;
* payment failures must expose enough context to identify the operation and failure category;
* repeated background synchronization failures should be observable.

Follow `docs/guidelines/LOGGING.md` for implementation conventions.

Use `None` when the feature introduces no meaningful observability requirements beyond existing conventions.

---

## Security / privacy considerations

Document feature-specific security or privacy requirements.

Consider when relevant:

* authentication;
* authorization;
* ownership;
* sensitive data;
* data exposure;
* destructive operations;
* permissions;
* external integrations.

Do not invent security requirements unrelated to the feature.

Use `None` when no feature-specific consideration exists.

---

## Open questions

List unresolved product decisions or ambiguities that materially affect implementation or expected behavior.

* TODO

Do not hide assumptions in the implementation when they belong here.

Resolve important open questions before implementation whenever practical.

Use `None` when there are no unresolved questions.

---

# Template

```markdown
# Feature: TODO

## Context

TODO

## User story

As a TODO, I want TODO, so that TODO.

## Expected behavior

- TODO
- TODO

## Out of scope

- TODO or `None`.

## Edge cases

- TODO or `None`.

## Acceptance criteria

- [ ] TODO
- [ ] TODO

## Testing considerations

Optional. List only important risks or cases already known to require particular attention. The complete test plan must still be derived from the acceptance criteria and implementation context.

- TODO or `None`.

## Data / API considerations

TODO or `None`.

## UX / UI considerations

TODO or `None`.

## Observability

TODO or `None`.

## Security / privacy considerations

TODO or `None`.

## Open questions

- TODO or `None`.
```

---

# Core rule

A specification should answer:

> **What behavior are we building, why does it exist, and how will we know it is correct?**

It should not attempt to answer every implementation question before development begins.
