# 0001 — Harness documentation bootstrap

## Status
IMPLEMENTED. Reconciled on 2026-10-14 using the human-confirmed prior acceptance of foundation phases 0.1a–0.1d and the published baseline/hosted CI evidence below. Original requirements, approval conditions, and phase-local verification statements are preserved as historical records, not current pending work.

## Problem
The empty repository needs a small, authoritative documentation harness so future implementation follows approved requirements, predictable verification, and financial safety boundaries.

## Goals
Establish concise agent instructions, project orientation, the architectural baseline, a reusable specification format, and a verifiable documentation-only development cycle.

## Non-goals
No application code, Cargo manifests or lockfile, toolchain configuration files, CI workflows, dependencies, empty ADRs, trading functionality, commits, pushes, deployments, or work outside the repository. Phase 0.1b requires separate human approval.

## Functional requirements
- FR1: Create exactly AGENTS.md, README.md, docs/architecture.md, docs/specs/TEMPLATE.md, and this specification.
- FR2: Agent instructions define the knowledge hierarchy, specification-first workflow, small changes, architecture approval, Definition of Done, future Cargo gates, safety boundaries, and accurate reporting.
- FR3: README describes the project, current phase, baseline, documentation entrypoints, workflow, and verification applicability.
- FR4: Architecture records the approved baseline, future in-process responsibilities, and substantive ADR conventions under docs/adr/ without creating placeholder records.
- FR5: Both specification documents use the ten required sections shown in the template. This specification remains APPROVED pending verification and human acceptance.

## Non-functional requirements
- NFR1: Keep universal agent instructions concise; place feature details in specifications.
- NFR2: Use Spec → Plan → Test → Implement → Verify → Review → Approval.
- NFR3: Record Rust edition 2024, toolchain 1.99.0, Windows PowerShell, one binary package, GitHub and future GitHub Actions, and no third-party bootstrap dependencies consistently.
- NFR4: Permit public, read-only market data only. Prohibit live trading, real orders, exchange or wallet credentials, signing, blockchain transaction execution, and mainnet operations or deployments. Future simulation is paper-only and separately approved.
- NFR5: Future mandatory tests use deterministic fixtures and controlled time without live services or credentials.

## Acceptance criteria
- AC1 (FR1): Exactly the five requested files are added, with no other project files changed.
- AC2 (FR2): AGENTS.md includes every required instruction category and the four exact Cargo verification commands.
- AC3 (FR3): README identifies the documentation-only phase and its local Markdown links resolve.
- AC4 (FR4, NFR3): Architecture records every approved decision, conceptual responsibility separation, no speculative microservices, and future ADR naming, contents, status, and approval conventions; no placeholder ADRs exist.
- AC5 (FR5): Both specifications contain Status, Problem, Goals, Non-goals, Functional requirements, Non-functional requirements, Acceptance criteria, Verification plan, Dependencies and risks, and Open decisions. This specification has status APPROVED.
- AC6 (NFR1–NFR5): Documents agree on scope, baseline, development cycle, safety, deterministic verification, and Definition of Done.
- AC7: The review report lists created files, Git changes, executed checks, inapplicable checks, limitations, risks, and open decisions without claiming Cargo gates passed.

## Verification plan
Before writing, inspect repository contents and Git status. After writing, inspect all five documents; check their required sections, local links, baseline statements, command consistency, and safety boundaries. Compare the filesystem and Git status against the exact five-file scope. Review Git whitespace checks and document changes, accounting for files being untracked in an unborn repository.

No application tests are required for documentation-only changes. Formatting, Clippy, compilation, and Cargo tests are not applicable because Cargo.toml does not exist. Do not run or claim these gates passed in this phase.

Definition of Done: all acceptance criteria satisfied; required tests implemented and passing where applicable; applicable formatting, linting, compilation, and test checks passing; documentation consistent with implementation; changes and limitations explicitly reported; and human acceptance before milestone closure. Report documented exceptions for this phase. Stop after documentation review and await human acceptance and separate approval for Phase 0.1b.

## Dependencies and risks
Depends on the human-approved Phase 0.1a scope and baseline. Rust tools were discovered previously, but the Windows MSVC linker, package compilation, dependency access, and CI remain unverified. Untracked files need explicit review because normal git diff does not show their contents. Keep checks read-only and do not install tools or stage files to obtain evidence.

## Open decisions
None block the approved documentation scope. Future specifications or ADRs must resolve market-data provider, asset coverage, async runtime, numeric precision, persistence, monitoring rules, notification output, and CI operating systems. The human approves architectural decisions. Package bootstrap and milestone closure remain subject to explicit human approval.

## Phase 0.1b — Approved Cargo bootstrap

### Scope and plan
Initialize one standard binary package named rust-crypto-monitor, version 0.1.0, edition 2024, pinned to Rust 1.99.0. Create Cargo.toml, Cargo.lock, rust-toolchain.toml, src/main.rs, and .gitignore; align existing documentation. Use an empty main function. No dependencies, workspace declaration, application behavior, networking, credentials, trading, CI, commits, pushes, or deployment. This extends the accepted documentation-only scope without changing architecture.

### Acceptance criteria
- B1: Cargo metadata identifies one binary package, edition 2024, and zero dependencies.
- B2: The toolchain file pins 1.99.0 with rustfmt and Clippy; the active toolchain targets Windows MSVC.
- B3: Cargo.lock contains only the local package and Git ignores /target/.
- B4: main.rs contains only an empty main function, with no features or secrets.
- B5: All four mandatory gates pass; native binary compilation verifies local MSVC linking.
- B6: Documentation records actual verification evidence and limitations. Overall status stays APPROVED; Phase 0.1c requires separate approval.

### Verification plan
Inspect instructions, architecture, specification, Git status, and toolchain before changes. Inspect Cargo metadata, manifest, lockfile, toolchain pin, and source after initialization. Run the four gates in AGENTS.md, verify Git ignores target artifacts, and check documentation links and whitespace accounting for CRLF. No behavioral tests are warranted for an empty main function; report the zero-test result explicitly.

### Verification evidence
Historical Phase 0.1a statements about absent Cargo and inapplicable gates apply only to that accepted phase. Phase 0.1b verified B1–B6:

- Initialized with `cargo +1.99.0 init --bin --edition 2024 --name rust-crypto-monitor --vcs none .`; generated Cargo.lock with `cargo generate-lockfile --offline`. Both succeeded.
- `cargo metadata --locked --no-deps --format-version 1` succeeded: one binary package, rust-crypto-monitor 0.1.0, edition 2024, no dependencies or features. The manifest has no workspace declaration. Cargo's metadata includes its implicit single-package workspace, not a multi-crate workspace.
- `rustup show active-toolchain` selected 1.99.0-x86_64-pc-windows-msvc through rust-toolchain.toml. `rustc --version --verbose` confirmed Rust 1.99.0 and Windows MSVC host; rustfmt and Clippy were available.
- `cargo fmt --all -- --check` passed.
- `cargo clippy --locked --all-targets --all-features -- -D warnings` passed.
- `cargo build --locked --all-targets --all-features` passed and produced target/debug/rust-crypto-monitor.exe, verifying local MSVC linking.
- `cargo test --locked --all-features` passed with zero tests, appropriate to an empty main function; this is not behavioral coverage.
- `git check-ignore -v target/debug/rust-crypto-monitor.exe` matched /target/ in .gitignore. Cargo.lock contains only the local package. Source inspection confirmed only `fn main() {}` with no credentials, networking, or business logic.

No quality-gate failures occurred. The exact named toolchain was installed through an explicitly approved rustup operation during the earlier interrupted attempt; it was already available on resumption. No new architectural decision or ADR was required. CI and future feature behavior remain unverified. The overall milestone stays APPROVED pending remaining work and human acceptance; do not start Phase 0.1c automatically.

## Foundation closure reconciliation — 2026-10-14
The human confirmed previous acceptance of phases 0.1a–0.1d and authorized this status reconciliation. Initial commit `19b7cf17302f7ee3ad9b3c2377483e446a96b92c` is published on main with origin configured. [Hosted run 38555819823](https://github.com/victorrusskikh96-byte/rust-crypto-monitor/actions/runs/38555819823) completed successfully for that exact commit; GitHub API inspection confirmed successful Formatting, Clippy, Build, and Tests steps. This closes the earlier hosted-verification prerequisite, including specification 0002 AC7. Baseline tests contain zero cases; no behavioral or adapter test coverage is claimed.

The original status at phase review was: APPROVED. The human explicitly approved the Phase 0.1a documentation scope and architectural baseline on 2026-10-13. Phase 0.1a passed AC1–AC7 and was accepted by the Technical Lead. Phase 0.1b is now explicitly authorized. Keep the overall milestone APPROVED until remaining work is complete and accepted. The original sections below record the accepted Phase 0.1a scope; the addendum governs Phase 0.1b.

All pending/absent-remote/branch/publication statements in the original sections describe their historical phase, not current repository state. Prior acceptance and verified evidence now support IMPLEMENTED. Historical scope limits remain unchanged; this reconciliation does not retroactively expand them or authorize new code, dependencies, commits, or pushes. Current Market Data Adapter decisions are recorded in [ADR 0001](../adr/0001-market-data-adapter.md) and [specification 0003](0003-market-data-adapter.md). No separate 0.1d specification is introduced.
