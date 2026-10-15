# Rust Crypto Monitor

A planned long-running CLI service for monitoring public cryptocurrency market data. Development uses a human-reviewed, incremental specification-driven workflow with Codex.

## Current phase
Foundation phases 0.1a–0.1d are implemented and previously accepted by the human. The initial Git baseline is published and all four hosted Cargo gates passed. Phase 0.2b records the approved Market Data Adapter architecture. Phase 0.2c implements validated Pair, Price, TimeoutConfig, and domain errors with deterministic tests and was conditionally accepted by the Technical Lead. The single package now includes a library target for domain tests; the binary entry point remains empty. Phase 0.2d adds offline Binance ticker normalization, PriceObservation, provider identity, and an injectable observation clock, accepted by the Technical Lead. Direct dependencies are rust_decimal 1.43.0 (std), serde 1.0.229 (std/derive), and serde_json 1.0.154 (std), with default features disabled. Phase 0.2e adds single-attempt fetch orchestration with a scripted fake transport, pending review. Production HTTP and application integration remain deferred. Rust 1.99.0 remains pinned.

## Approved baseline
- One Rust binary package and one process.
- Rust edition 2024, pinned toolchain 1.99.0.
- Windows PowerShell development environment.
- GitHub repository with verified GitHub Actions CI.
- Public, read-only market data; no third-party dependencies during bootstrap.

## Documentation
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

All commands must succeed. Feature tests use deterministic fixtures and controlled time, without live service or credential dependencies. Phase 0.1b passed all four gates on Windows MSVC; tests reported zero cases because main is empty. The native binary was linked successfully. Phase 0.2c adds 13 passing offline domain tests; Phase 0.2d adds 15 passing offline normalization tests; Phase 0.2e adds 15 passing offline fetch tests (43 total). Later adapter behavior still requires its own acceptance tests. Cargo.lock is included in the published baseline; target build artifacts are ignored. Hosted gates passed for the same empty binary; this establishes no adapter behavior coverage.

## Safety boundaries
No live trading, real orders, exchange or wallet credentials, signing, blockchain transaction execution, or mainnet operations or deployments. Future simulation, if approved, is paper trading only. No commits, pushes, publishing, or deployments without explicit approval.

## Continuous integration
[CI workflow](.github/workflows/ci.yml) runs on push and pull requests, using one ubuntu-24.04 job with Rust 1.99.0 and the four commands above. The official checkout action is pinned to a v7 commit, with credential persistence disabled. Only contents: read token permission is granted. Any failed required check fails the job; timeout is 15 minutes. Cargo.lock is included in the initial commit; CI never regenerates it. There is no deployment, cache, or CI matrix.

The .yml file uses JSON-formatted YAML for dependency-free local parsing. Syntax and structural checks do not establish hosted execution. Origin is configured for the project repository. [Hosted run 38555819823](https://github.com/victorrusskikh96-byte/rust-crypto-monitor/actions/runs/38555819823) succeeded for commit `19b7cf17302f7ee3ad9b3c2377483e446a96b92c`; GitHub API verification confirmed Formatting, Clippy, Build, and Tests all passed. The human confirmed prior acceptance of phases 0.1a–0.1d. Future commits, publication, and milestone closure still require explicit approval.
