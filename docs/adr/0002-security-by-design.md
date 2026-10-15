# ADR 0002 — Security by Design

## Title
Make Security by Design mandatory throughout the development harness and future architecture.

## Date
2026-10-15.

## Status
ACCEPTED for the architectural principle explicitly directed by the human in the Security Baseline milestone. Acceptance does not certify implementation of every baseline control, close the documentation milestone or authorize tooling, CI changes, credentials or financial operations.

## Context
The read-only adapter already uses defensive networking, exact input validation, bounded reads, static errors and offline test seams. These protections need a consistent policy across future boundaries, dependencies, configuration and operations. Automated security scanners, runtime isolation and a verified vulnerability intake are not established. Existing approved decisions must remain intact.

## Decision
- Security by Design is mandatory for every milestone: review relevant [security-baseline requirements](../security/security-baseline.md), identify trust boundaries and threats before implementation, validate inputs, minimize privilege/dependencies and report residual risks.
- Distinguish mandatory CURRENT policy from evidence of implemented controls and conditional FUTURE requirements. Tests, source/configuration review and operational verification are separate evidence classes.
- Keep current read-only/financial restrictions from [ADR 0001](0001-market-data-adapter.md). Future trading safeguards are prerequisites for a separately reviewed scope change, not authorization to implement or enable trading.
- Review security tooling and supply-chain changes incrementally. The baseline contains an evaluation plan; installation, CI adoption, repository settings and automatic dependency fixes need separately approved work.
- Record unresolved risks and human-approved time-bounded exceptions; never present missing or failed security verification as a passed control.

## Alternatives
- Rely only on Cargo quality gates: useful for correctness but lacks vulnerability, secret-handling and trust-boundary policy.
- Adopt scanners immediately: would exceed the documentation scope and skip local compatibility/policy evaluation.
- Treat future trading safeguards as capability approval: conflicts with the existing read-only boundary.

## Consequences
[AGENTS.md](../../AGENTS.md) becomes the concise mandatory entrypoint and [the baseline](../security/security-baseline.md) holds detailed requirements/evidence. Review work increases when boundaries or dependency graphs change. This creates no runtime enforcement, vulnerability-free guarantee, staffed reporting SLA or automated scanner. Existing ADRs, exact-price behavior and current financial prohibitions are preserved.

## Related specification links
- [Market Data Adapter specification 0003](../specs/0003-market-data-adapter.md).
- [Accepted Market Data Adapter ADR 0001](0001-market-data-adapter.md).
- [Architecture and decision conventions](../architecture.md).
