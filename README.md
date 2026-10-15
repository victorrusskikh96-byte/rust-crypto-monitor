# Rust Crypto Monitor

A planned long-running CLI service for monitoring public cryptocurrency market data. Development uses a human-reviewed, incremental specification-driven workflow with Codex.

## Current phase
Foundation phases 0.1a–0.1d are implemented and previously accepted by the human. The initial Git baseline is published and all four hosted Cargo gates passed. Phase 0.2b records the approved Market Data Adapter architecture. Phase 0.2c implements validated Pair, Price, TimeoutConfig, and domain errors with deterministic tests and was conditionally accepted by the Technical Lead. The single package now includes a library target for domain tests; the binary entry point remains empty. Phase 0.2d adds offline Binance ticker normalization, PriceObservation, provider identity, and an injectable observation clock, accepted by the Technical Lead. Direct dependencies are rust_decimal 1.43.0 (std), serde 1.0.229 (std/derive), and serde_json 1.0.154 (std), with default features disabled. Phase 0.2e adds single-attempt fetch orchestration with a scripted fake transport, published at af007d861839d51a67724ad6f47d584c8dca9958 with all four hosted gates passing. Phase 0.2f adds reqwest 0.13.5 (blocking/rustls, default features disabled), a reusable fixed-destination HTTP client, bounded streaming reads and 14 offline transport tests, pending human review. Phase 0.2g adds three focused integration tests (60 total) and recommends ACCEPT WITH LIMITATIONS, pending human review. The final Phase 0.2 local review retains ACCEPT WITH LIMITATIONS: all four gates and 60 tests pass, and verified cargo-audit/Gitleaks evidence reports no findings. OS-enforced network isolation evidence and human acceptance of specification closure remain outstanding. Application integration remains deferred. Rust 1.99.0 remains pinned.

## Approved baseline
- One Rust binary package and one process.
- Rust edition 2024, pinned toolchain 1.99.0.
- Windows PowerShell development environment.
- GitHub repository with verified GitHub Actions CI.
- Public, read-only market data; no third-party dependencies during bootstrap.

## Documentation
- [Project context and session recovery](docs/PROJECT_CONTEXT.md)
- [Agent instructions](AGENTS.md)
- [Architecture and decision conventions](docs/architecture.md)
- [Specification template](docs/specs/TEMPLATE.md)
- [Approved documentation bootstrap specification](docs/specs/0001-harness-bootstrap.md)
- [CI bootstrap specification](docs/specs/0002-ci-bootstrap.md)
- [Approved Market Data Adapter specification](docs/specs/0003-market-data-adapter.md)
- [Accepted Market Data Adapter ADR](docs/adr/0001-market-data-adapter.md)

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

All commands must succeed. Feature tests use deterministic fixtures and controlled time, without live service or credential dependencies. Phase 0.1b passed all four gates on Windows MSVC; tests reported zero cases because main is empty. The native binary was linked successfully. Phase 0.2c adds 13 passing offline domain tests; Phase 0.2d adds 15 passing offline normalization tests; Phase 0.2e adds 15 passing offline fetch tests; Phase 0.2f adds 14 transport tests; Phase 0.2g adds two streaming-pipeline tests and one external public-API test (60 total). Tests pass with Cargo offline mode; OS-enforced network denial is not claimed. Cargo.lock is included in the published baseline; target build artifacts are ignored. Hosted gates passed for the same empty binary; this establishes no adapter behavior coverage.

## Security by Design
Security by Design is mandatory for every milestone. See the [security baseline](docs/security/security-baseline.md) for current requirements, evidence/gaps, future financial safeguards and the incremental security-tooling plan, and [ADR 0002](docs/adr/0002-security-by-design.md) for the architectural decision. Planned controls and tools are not implementation claims or authorization for trading.

## Safety boundaries
No live trading, real orders, exchange or wallet credentials, signing, blockchain transaction execution, or mainnet operations or deployments. Future simulation, if approved, is paper trading only. No commits, pushes, publishing, or deployments without explicit approval.

## Continuous integration
[CI workflow](.github/workflows/ci.yml) runs on push and pull requests, using one ubuntu-24.04 job with Rust 1.99.0 and the four commands above. The official checkout action is pinned to a v7 commit, with credential persistence disabled. Only contents: read token permission is granted. Any failed required check fails the job; timeout is 15 minutes. Cargo.lock is included in the initial commit; CI never regenerates it. There is no deployment, cache, or CI matrix.

The .yml file uses JSON-formatted YAML for dependency-free local parsing. Syntax and structural checks do not establish hosted execution. Origin is configured for the project repository. [Hosted run 38555819823](https://github.com/victorrusskikh96-byte/rust-crypto-monitor/actions/runs/38555819823) succeeded for commit `19b7cf17302f7ee3ad9b3c2377483e446a96b92c`; GitHub API verification confirmed Formatting, Clippy, Build, and Tests all passed. The human confirmed prior acceptance of phases 0.1a–0.1d. Future commits, publication, and milestone closure still require explicit approval.
