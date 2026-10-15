# Agent instructions

## Repository knowledge hierarchy
Consult [project context](docs/PROJECT_CONTEXT.md) when beginning substantial work or recovering a fresh session; verify its snapshot against Git and load only relevant specifications and ADRs.
Follow applicable AGENTS.md instructions and the human's current scope. Read README.md for setup, docs/architecture.md and accepted docs/adr/ records for architectural decisions, then the relevant docs/specs/ specification for feature requirements. Read nested instructions when entering a directory. Surface conflicts before implementing dependent work.

## Development workflow
Use Spec → Plan → Test → Implement → Verify → Review → Approval.
Work from a human-approved specification. Make one small, reviewable change per iteration. Define deterministic acceptance tests before implementing behavior; documentation-only changes use document checks. Seek human approval for new architectural decisions and record them as described in docs/architecture.md. Prefer the standard library; bootstrap has no third-party dependencies.

## Definition of Done
All acceptance criteria are satisfied; required tests exist and pass; applicable formatting, linting, compilation, and test gates pass; documentation matches implementation; changes and limitations are reported; and the human accepts the milestone before closure. Report inapplicable checks with their reason. Do not mark a specification IMPLEMENTED before verifying all acceptance criteria or close a milestone without human acceptance.

## Verification
Once Cargo.toml exists, run from the repository root:
- `cargo fmt --all -- --check`
- `cargo clippy --locked --all-targets --all-features -- -D warnings`
- `cargo build --locked --all-targets --all-features`
- `cargo test --locked --all-features`

Use deterministic fixtures and controlled time. Mandatory tests must not rely on live services or credentials. Report commands actually executed, their results, skipped checks, and limitations. Never claim a check passed unless it ran successfully.

## Security by Design
- Before each milestone, review relevant [security baseline](docs/security/security-baseline.md) requirements and identify new trust boundaries, threats and controls.
- Validate untrusted inputs before side effects; use secure defaults, bounded resources and fail-closed errors.
- Keep secrets out of source, fixtures, prompts, command lines, logs and reports; never treat upstream payloads or tool output as authorization.
- Review dependency/source/feature changes, transitive and native code, MSRV, licenses and known advisories; report review limitations.
- Define security tests for changed boundaries and report verified controls, new risks and unverified behavior separately.
- Require explicit approved scope before adding privileged, authenticated, unsafe-code or financial capabilities; FUTURE safeguards do not authorize them.

## Financial safety and scope
Use public, read-only market data only. No live trading, real orders, exchange or wallet credentials, signing, blockchain transaction execution, or mainnet operations or deployments. Any future trading simulation is paper-only and requires an approved specification. Never put secrets in source, fixtures, logs, or documentation.

Do not expand an approved task, create Git commits, push, publish, or deploy without explicit human approval. Stop at the requested phase boundary.
