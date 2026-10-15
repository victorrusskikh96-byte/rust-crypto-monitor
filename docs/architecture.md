# Architecture

## Approved baseline
Rust Crypto Monitor will be a long-running, single-process CLI monitoring service implemented as one Rust binary package using edition 2024 and toolchain 1.99.0. Development uses Windows PowerShell. GitHub hosts the published initial baseline and origin is configured. The Phase 0.1c GitHub Actions workflow has passed hosted verification; foundation phases 0.1a–0.1d were previously accepted by the human.

Only public, read-only cryptocurrency market data is permitted. Bootstrap introduces no third-party dependencies. Phase 0.1b created the minimal Cargo package with an empty main function. The monitoring responsibilities below describe the intended application, not existing behavior.

## Future responsibilities
As approved feature specifications require them, separate responsibilities within the single process:
- Ingestion: acquire public market data and handle source failures.
- Normalization: convert source data into consistent internal representations.
- Monitoring rules: evaluate observations against specified conditions.
- Notifications: present monitoring results through an approved output mechanism.

These are conceptual boundaries, not mandates to create modules now. No speculative microservices, distributed infrastructure, or orchestration framework is planned. Persistence, alert rules, and notification transport remain undecided. The Market Data Adapter choices below are accepted for the MVP. Phase 0.2c implements the domain layer; Phase 0.2d adds offline Binance response normalization using a private derived DTO and injected Clock. Phase 0.2e adds one-call orchestration over the approved HttpTransport seam with a scripted fake in tests. Phase 0.2f adds a reusable reqwest 0.13.5 blocking/Rustls transport with fixed destination, verified TLS, disabled redirects/proxies/retries/decompression and bounded streaming reads. Idle connection pooling is disabled to avoid Hyper's independent stale-connection retry path; the client and its internal runtime are reused. Phase 0.2g confirms the public construction path and streaming-response composition without production changes; the integration review recommends ACCEPT WITH LIMITATIONS pending human review and remaining network-isolation evidence. The final local acceptance review confirms both concrete production pair paths and retains ACCEPT WITH LIMITATIONS. Completed local cargo-audit/Gitleaks evidence is recorded in the security baseline; runtime network isolation, hosted transport/scanner verification and human closure remain outstanding. Application integration is deferred.

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

## Accepted Market Data Adapter architecture
[ADR 0001](adr/0001-market-data-adapter.md), accepted by the Technical Lead on 2026-10-14, governs [specification 0003](specs/0003-market-data-adapter.md): synchronous public Binance REST for BTC/USDT and ETH/USDT, reqwest blocking, serde/serde_json, exact rust_decimal prices, and narrow injectable HttpTransport/Clock seams. There is no application-owned Tokio runtime. No automatic retries (including controllable library protocol retries), redirects, proxy inheritance, credentials, trading, wallet operations, or blockchain transactions are permitted. Deterministic offline tests and all four Cargo gates remain mandatory. Exact dependency versions/features and implementation milestones require separate authorization. Bootstrap remains dependency-free until an authorized feature milestone changes Cargo files.

## Mandatory Security by Design
The human explicitly established Security by Design as a mandatory architectural principle on 2026-10-15. [ADR 0002](adr/0002-security-by-design.md) records the decision; the [security baseline](security/security-baseline.md) defines CURRENT requirements, supporting evidence and gaps, conditional FUTURE financial safeguards, and a proposed tooling evaluation sequence. Every milestone must review affected trust boundaries, input/resource limits, secrets, dependency changes and residual security risks through the existing specification and approval workflow.

This policy preserves ADR 0001 and the current read-only financial boundary. Future safeguards do not authorize trading, credentials or wallet operations. Security tools, CI integration and operational enforcement remain separately scoped work; the baseline does not claim those controls are implemented.

## Future Architecture Decision Records
Create substantive records under docs/adr/ only when a new architectural decision needs review. Do not create empty placeholder records or directories.

Use names such as `0001-short-decision-title.md`, with sequential numbers. Each record contains Title, Date, Status, Context, Decision, Alternatives, Consequences, and related specification links. Status is PROPOSED, ACCEPTED, REJECTED, or SUPERSEDED. Human approval is required before marking a record ACCEPTED or implementing dependent architectural changes. Preserve superseded records and link their replacements. Keep this baseline consistent with accepted records.

## Verification boundaries
Mandatory application gates are formatting, Clippy, compilation, and tests as listed in AGENTS.md and README.md. Tests must be deterministic and independent of live services. Phase 0.1b verified formatting, Clippy, compilation, and tests using the pinned Windows MSVC toolchain. The successful native binary build verifies local MSVC linking. The original baseline contained zero tests because main is empty. Phase 0.2c adds 13 offline domain integration tests through a library target in the same package; Phase 0.2d adds 15 offline normalization tests, Phase 0.2e adds 15 offline fetch tests and Phase 0.2f adds 14 offline transport unit tests, and Phase 0.2g adds two pipeline tests plus one public-API integration test (60 total). Main remains unchanged. Hosted CI also passed all four gates for the Phase 0.2e core checkpoint af007d861839d51a67724ad6f47d584c8dca9958. Phase 0.2f is locally verified on Windows; hosted Ubuntu execution and live-provider behavior are unverified.

## CI harness
The approved Phase 0.1c scope uses one ubuntu-24.04 job triggered by push and pull_request. It installs the pinned Rust 1.99.0 toolchain with rustfmt and Clippy, then runs the four mandatory gates separately with the required lockfile flags. Checkout is the only action, pinned to a v7 commit with credential persistence disabled. Token permissions are limited to contents: read. Failure of a required step fails the job; there is no deployment or failure suppression.

See [CI specification](specs/0002-ci-bootstrap.md). Local Windows checks and parsing do not verify Ubuntu execution. [Hosted run 38555819823](https://github.com/victorrusskikh96-byte/rust-crypto-monitor/actions/runs/38555819823) succeeded for commit `19b7cf17302f7ee3ad9b3c2377483e446a96b92c`. GitHub API inspection confirmed successful Formatting, Clippy, Build, and Tests steps. Prior human acceptance of foundation phases 0.1a–0.1d completes the harness milestone. Historical decisions remain recorded above; the newly accepted adapter decisions are separate from the implemented harness.
