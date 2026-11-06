# ADR-NNN: [Short title of the decision]

**Status:** Proposed | Accepted | Superseded by ADR-NNNN | Deprecated

**Date:** YYYY-MM-DD

**Deciders:** [who was involved]

## Context

What is the problem or situation that requires a decision? Include
relevant constraints (scale, budget, timeline, existing architecture).
State the facts, not the preferred answer — this section should be
reusable even if a future team disagrees with the eventual decision.

## Decision

What was decided, stated as a clear, direct sentence. E.g. "We will use
PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) to prevent
capacity-slot overbooking, rather than an application-level mutex."

## Options considered

List the realistic alternatives, including "do nothing" if relevant.

### Option A — [name]
- Pros:
- Cons:

### Option B — [name]
- Pros:
- Cons:

### Option C — [name]
- Pros:
- Cons:

## Rationale

Why the chosen option won, specifically in terms of this project's
constraints (current scale, team size, budget) — not in the abstract.
Reference `architecture.md` if this decision extends or modifies it.

## Consequences

- What becomes easier as a result of this decision?
- What becomes harder, or what debt does this introduce?
- What would trigger revisiting this decision (e.g. "if daily orders
  exceed X" or "if we add delivery")?

## Related

- Links to relevant sections of `architecture.md`
- Links to other ADRs this supersedes, depends on, or conflicts with