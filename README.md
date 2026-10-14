# Rust Crypto Monitor

A planned long-running CLI service for monitoring public cryptocurrency market data. Development uses a human-reviewed, incremental specification-driven workflow with Codex.

## Current phase
Phase 0.1a documentation was accepted by the Technical Lead. Phase 0.1b initializes a minimal Cargo binary package with an empty main function and no dependencies or application behavior. Rust 1.99.0 is pinned in rust-toolchain.toml. Phase 0.1c adds a CI workflow; hosted execution remains unverified until publication and a successful GitHub Actions run.

## Approved baseline
- One Rust binary package and one process.
- Rust edition 2024, pinned toolchain 1.99.0.
- Windows PowerShell development environment.
- GitHub repository with future GitHub Actions CI.
- Public, read-only market data; no third-party dependencies during bootstrap.

## Documentation
- [Agent instructions](AGENTS.md)
- [Architecture and decision conventions](docs/architecture.md)
- [Specification template](docs/specs/TEMPLATE.md)
- [Approved documentation bootstrap specification](docs/specs/0001-harness-bootstrap.md)
- [CI bootstrap specification](docs/specs/0002-ci-bootstrap.md)

The development cycle is Spec → Plan → Test → Implement → Verify → Review → Approval. Define observable acceptance criteria first, establish appropriate tests or document checks, implement a small change, verify it, and obtain human acceptance before closing the milestone.

## Verification
The Cargo package now exists. Run the mandatory gates below from the repository root. Documentation is also checked for scope, required sections, local links, consistency, and Git changes.

Run in PowerShell from the repository root:

```powershell
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo build --locked --all-targets --all-features
cargo test --locked --all-features
```

All commands must succeed. Feature tests use deterministic fixtures and controlled time, without live service or credential dependencies. Phase 0.1b passed all four gates on Windows MSVC; tests reported zero cases because main is empty. The native binary was linked successfully. Future behavior requires meaningful acceptance tests. Cargo.lock is committed when commits are authorized; target build artifacts are ignored. No CI execution has been verified.

## Safety boundaries
No live trading, real orders, exchange or wallet credentials, signing, blockchain transaction execution, or mainnet operations or deployments. Future simulation, if approved, is paper trading only. No commits, pushes, publishing, or deployments without explicit approval.

## Continuous integration
[CI workflow](.github/workflows/ci.yml) runs on push and pull requests, using one ubuntu-24.04 job with Rust 1.99.0 and the four commands above. The official checkout action is pinned to a v7 commit, with credential persistence disabled. Only contents: read token permission is granted. Any failed required check fails the job; timeout is 15 minutes. Cargo.lock must be included in the first approved commit; CI never regenerates it. There is no deployment, cache, or CI matrix.

The .yml file uses JSON-formatted YAML for dependency-free local parsing. Syntax and structural checks do not establish hosted execution. No GitHub remote or hosted run exists yet. Human review and explicit approval are required before committing or publishing; milestone closure also requires successful hosted verification.
