# 0002 — GitHub Actions CI bootstrap

## Status
IMPLEMENTED. Reconciled on 2026-10-14 using the human-confirmed prior acceptance of foundation phases 0.1a–0.1d and the published baseline/hosted CI evidence below. Original requirements, approval conditions, and phase-local verification statements are preserved as historical records, not current pending work.

## Problem
Local gates pass, but the repository needs automated verification on GitHub without introducing application behavior or deployment.

## Goals
Provide one minimal Ubuntu workflow with the same four mandatory Cargo gates and a fixed Rust toolchain.

## Non-goals
No application changes, dependencies, caching, matrices, deployment, secrets, repository creation, commits, or pushes. Windows CI is deferred.

## Functional requirements
- FR1: Run on push and pull_request with no branch or path filters.
- FR2: Use one job on ubuntu-24.04 with contents: read as the only token permission; disable checkout credential persistence.
- FR3: Use the official checkout action pinned to the resolved v7 commit. Install Rust 1.99.0 using rustup with the minimal profile, rustfmt, and Clippy. Activate it through the existing rust-toolchain.toml.
- FR4: Run the four exact AGENTS.md gates in separate steps. Use --locked wherever required and retain Cargo.lock. Never regenerate it in CI.
- FR5: A failed required step fails the job; no continue-on-error or conditional failure suppression. Limit the job to 15 minutes.

## Non-functional requirements
Keep one workflow, one job, and one marketplace action. No stored credentials, elevated token permissions, application networking, or trading. Use JSON-formatted YAML (valid YAML flow syntax) so installed Python can parse it without additional tooling. Runner image contents may change; Rust and checkout source are pinned. Assume the hosted runner provides rustup and access to Rust distribution servers.

## Acceptance criteria
- AC1: One workflow defines both triggers, Ubuntu runner, least permissions, disabled credential persistence, and a pinned checkout reference.
- AC2: The installation command agrees with rust-toolchain.toml and includes rustfmt and Clippy.
- AC3: Four separate steps exactly match AGENTS.md, use the required lockfile flags, and propagate failures.
- AC4: Available local tools parse the workflow and verify its structure; all four local Cargo gates pass.
- AC5: Only this specification, the workflow, README, and architecture are changed in this phase; application and package files remain unchanged.
- AC6: Documentation clearly distinguishes local validation from hosted execution. Human approval is required for committing, publishing, and milestone closure.
- AC7: After separately approved publication, an actual GitHub Actions run completes successfully on Ubuntu. Until then CI is not verified.

## Verification plan
Capture file hashes before edits. Parse the workflow using Python json; assert triggers, permissions, runner, action reference, setup, separate exact commands, and absence of failure suppression. Review against official GitHub workflow documentation. Rerun all four local Cargo gates. Check allowed file scope, unchanged hashes, links, CRLF-aware whitespace, Git status, and empty index. No new validation tools are installed. Parsing is not a full Actions schema or execution validation.

## Dependencies and risks
Depends on accepted Phase 0.1b, existing Cargo.lock and toolchain pin, GitHub-hosted Ubuntu and rustup availability, and network access for checkout and Rust installation. No remote currently exists. Windows local results do not establish Linux execution. actionlint, yamllint, and PyYAML are unavailable. Dedicated Actions semantic validation is deferred to GitHub.

Official references: [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [checkout](https://github.com/actions/checkout). Checkout v7 resolved via git ls-remote to 3d3c42e5aac5ba805825da76410c181273ba90b1.

## Open decisions
Human selects repository owner, visibility, and remote URL and approves the first commit and publication. Current local branch is master; renaming is not necessary for unfiltered CI triggers. Hosted acceptance remains pending.

## Local verification evidence
- AC1–AC3: Python standard-library json parsing and structural assertions passed for triggers, permissions, runner, timeout, checkout pin, disabled credential persistence, toolchain setup, exact separate Cargo commands, and absence of failure suppression.
- AC4: All four local Cargo gates passed. Tests reported zero cases; the empty entry point has no behavioral test coverage.
- AC5: SHA256 comparisons confirmed that all pre-existing files except README and architecture were unchanged. Only the numbered CI specification and workflow were added.
- AC6: Documentation distinguishes local checks from hosted verification and preserves approval boundaries.
- AC7: PENDING. No remote, commit, push, or actual Actions run exists. Overall status remains APPROVED.

Initial discovery returned exit 1 because optional validation commands were absent; no repository inspection failed. GitHub API tag/release lookups through the browser returned errors; git ls-remote successfully resolved the official v7 tag instead. No tools were installed. Full Actions semantic validation and Ubuntu execution remain pending.

## Foundation closure reconciliation — 2026-10-14
The human confirmed previous acceptance of phases 0.1a–0.1d and authorized this status reconciliation. Initial commit `19b7cf17302f7ee3ad9b3c2377483e446a96b92c` is published on main with origin configured. [Hosted run 38555819823](https://github.com/victorrusskikh96-byte/rust-crypto-monitor/actions/runs/38555819823) completed successfully for that exact commit; GitHub API inspection confirmed successful Formatting, Clippy, Build, and Tests steps. This closes the earlier hosted-verification prerequisite, including specification 0002 AC7. Baseline tests contain zero cases; no behavioral or adapter test coverage is claimed.

The original status at phase review was: APPROVED scope: the human authorized Phase 0.1c after accepting Phase 0.1b. Implementation remains subject to human review. Do not mark IMPLEMENTED until all criteria, including an actual GitHub Actions run, are verified and closure is accepted.

All pending/absent-remote/branch/publication statements in the original sections describe their historical phase, not current repository state. Prior acceptance and verified evidence now support IMPLEMENTED. Historical scope limits remain unchanged; this reconciliation does not retroactively expand them or authorize new code, dependencies, commits, or pushes. Current Market Data Adapter decisions are recorded in [ADR 0001](../adr/0001-market-data-adapter.md) and [specification 0003](0003-market-data-adapter.md). No separate 0.1d specification is introduced.
