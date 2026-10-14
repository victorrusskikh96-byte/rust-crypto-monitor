# Architecture

## Approved baseline
Rust Crypto Monitor will be a long-running, single-process CLI monitoring service implemented as one Rust binary package using edition 2024 and toolchain 1.99.0. Development uses Windows PowerShell. GitHub is the approved hosting destination; no remote is configured yet. Phase 0.1c introduces a minimal GitHub Actions workflow, with hosted verification pending.

Only public, read-only cryptocurrency market data is permitted. Bootstrap introduces no third-party dependencies. Phase 0.1b creates the minimal Cargo package with an empty main function. The monitoring responsibilities below describe the intended application, not existing behavior.

## Future responsibilities
As approved feature specifications require them, separate responsibilities within the single process:
- Ingestion: acquire public market data and handle source failures.
- Normalization: convert source data into consistent internal representations.
- Monitoring rules: evaluate observations against specified conditions.
- Notifications: present monitoring results through an approved output mechanism.

These are conceptual boundaries, not mandates to create modules now. No speculative microservices, distributed infrastructure, or orchestration framework is planned. Async runtime, persistence, exchange provider, numeric representation, alert rules, and notification transport remain undecided.

## Safety boundary
No live trading, real orders, exchange or wallet credentials, signing, blockchain transaction execution, or mainnet operations or deployments. Any future simulation must be paper-only and separately specified and approved. Public market-data access does not authorize authenticated account access or trading endpoints.

## Initial decision record
The human approved the following baseline for Phase 0.1a on 2026-10-13:

| Decision | Rationale |
| --- | --- |
| Single binary package and single-process CLI service | Keep the initial implementation and review scope small. |
| Rust edition 2024 and toolchain 1.99.0 | Establish a fixed language and toolchain baseline. |
| Windows PowerShell development | Match the verified local environment. |
| GitHub and future GitHub Actions | Keep source review and eventual verification together. |
| Public, read-only market data | Bound the project to monitoring. |
| No third-party bootstrap dependencies | Minimize setup and dependency surface. |
| Incremental, human-reviewed SDD | Make each change traceable to approved requirements. |

## Future Architecture Decision Records
Create substantive records under docs/adr/ only when a new architectural decision needs review. Do not create empty placeholder records or directories.

Use names such as `0001-short-decision-title.md`, with sequential numbers. Each record contains Title, Date, Status, Context, Decision, Alternatives, Consequences, and related specification links. Status is PROPOSED, ACCEPTED, REJECTED, or SUPERSEDED. Human approval is required before marking a record ACCEPTED or implementing dependent architectural changes. Preserve superseded records and link their replacements. Keep this baseline consistent with accepted records.

## Verification boundaries
Mandatory application gates are formatting, Clippy, compilation, and tests as listed in AGENTS.md and README.md. Tests must be deterministic and independent of live services. Phase 0.1b verified formatting, Clippy, compilation, and tests using the pinned Windows MSVC toolchain. The successful native binary build verifies local MSVC linking. Tests currently contain zero cases because main is empty. CI remains unverified.

## CI harness
The approved Phase 0.1c scope uses one ubuntu-24.04 job triggered by push and pull_request. It installs the pinned Rust 1.99.0 toolchain with rustfmt and Clippy, then runs the four mandatory gates separately with the required lockfile flags. Checkout is the only action, pinned to a v7 commit with credential persistence disabled. Token permissions are limited to contents: read. Failure of a required step fails the job; there is no deployment or failure suppression.

See [CI specification](specs/0002-ci-bootstrap.md). Local Windows checks and parsing do not verify Ubuntu execution. CI remains unverified until a real GitHub Actions run succeeds after separately approved publication. This implements the already approved harness baseline without changing application architecture.
