# Rust Crypto Monitor — Project Context

Snapshot: 2026-10-18 (M2b.1 local HTTP accepted; Git checkpoint authorized). Recovery map only: reconcile with Git, approved specifications, accepted ADRs and current human authorization.

Evidence labels:
- **VERIFIED** — confirmed by inspected artifacts or executed checks; scope is stated.
- **REPORTED** — previous agent/human report, not independently reproduced here.
- **PLANNED** — approved or proposed future work; approval is stated separately.
- **BLOCKED** — work prevented by an unresolved condition; never implies a passed check.

## 1. Project Identity

- Product: **Rust Crypto Monitor**.
- Original purpose: a planned long-running CLI monitoring service.
- Product Owner-approved direction: a demonstrable Full-Stack Crypto Market &
  Portfolio Dashboard for international Upwork clients; future architecture accepted,
  current code has the synchronous CLI, pure valuation and bounded local HTTP API;
  refresh/worker/frontend remain deferred.
- Target users: portfolio reviewers and users manually estimating BTC/ETH holdings.
- Current MVP slice: one read-only latest-price observation for BTC/USDT or ETH/USDT
  through Binance; continuous monitoring is not implemented.
- Career objective: transition into professional Web3 engineering using the human
  developer's approximately three years of commercial backend experience together
  with demonstrable independent Rust and Solana portfolio projects.
- Target roles, in priority order: Web3 Backend Engineer; Rust Blockchain
  Infrastructure Engineer; Solana Smart Contract Developer.
- Professional positioning: represent commercial backend experience separately
  from independent Rust/Web3 portfolio experience. Do not claim commercial Rust
  or Solana experience that has not been demonstrated.
- Immediate portfolio objective: international Upwork backend/full-stack contracts.
  Longer-term Web3 employment and contract opportunities remain valid.
  Building a commercial monitoring SaaS is no longer the primary objective;
  SaaS subscriptions and live trading are not current priorities.
- Portfolio direction: [Portfolio roadmap](PORTFOLIO_ROADMAP.md). Finish this
  off-chain Rust adapter checkpoint; M0 proposes a dashboard instead of requiring
  a standalone CLI before the portfolio release. Future
  Solana escrow and indexer projects belong in separate repositories. M0 direction
  alone grants no implementation/financial scope; M1 separately authorizes the CLI.
- Source requirements: [README](../README.md), [architecture](architecture.md), [adapter specification](specs/0003-market-data-adapter.md).

## 2. Working Model

- Human: Product Owner and approval authority for scope, decisions and acceptance.
- ChatGPT: Technical Architect for planning, specifications, prompt design and reviews.
- Codex CLI: implementation and local verification agent within approved scope.
- Workflow: Spec → Plan → Test → Implement → Verify → Review → Approval.
- An architectural acceptance is not implementation or publication authorization.
- Commits, pushes, deployment and financial capabilities need explicit approval.
  Old approvals do not authorize a new checkpoint or unrelated work.
- Follow [AGENTS.md](../AGENTS.md); inspect relevant nested instructions. Load only
  specifications/ADRs needed for the task, not every historical specification.

## 3. Current Architecture

**VERIFIED** by manifest, toolchain, source and workflow inspection:

- One Rust package, edition 2024, pinned Rust 1.99.0; Windows PowerShell development.
- [src/main.rs](../src/main.rs) wires a synchronous one-observation CLI through
  [cli.rs](../src/cli.rs); [library](../src/lib.rs) exposes cli, market_data, portfolio and http.
- [HTTP](../src/http/mod.rs): --serve, IPv4 loopback:3000, dashboard/valuation only; current-thread runtime and bounded resources/deadlines. Empty immutable state, test-only fixtures, no provider capability.
- CLI validates one canonical OS argument before constructing production transport;
  stdout has exact price/USDT/provider and signed UTC Unix-seconds observation time.
  Exit codes: 0 success, 2 usage, 3 fetch/domain, 4 output. No new dependencies.
- [Portfolio domain](../src/portfolio.rs): validated quantities, fixed BTC/ETH slots,
  supplied quote age/attempt status, exact checked coefficient values/totals and
  half-even allocation. Missing/stale positive holdings withhold total/allocations.
  No I/O, clocks, JSON, web code, mutable Decimal exposure or new dependencies.
- [Domain](../src/market_data/types.rs): Pair, positive exact-decimal Price,
  TimeoutConfig, PriceObservation, provider identity, Clock and typed safe errors.
- [Normalization](../src/market_data/binance.rs): private typed Binance DTO,
  strict schema/symbol/decimal validation and injected local observation time.
- [Orchestration](../src/market_data/mod.rs): one attempt, status classification,
  Retry-After metadata, normalization; no stale/default price on failure.
- [Transport](../src/market_data/transport.rs): reusable reqwest blocking client,
  fixed HTTPS GET destination, bounded streaming collector, validated deadlines.
- Public construction: validated TimeoutConfig → ReqwestTransport::new →
  MarketDataAdapter::new with matching timeout durations and caller Clock →
  fetch_price for either typed Pair. No custom transport implementation is needed.
- [Cargo.toml](../Cargo.toml) pins rust_decimal 1.43.0, serde 1.0.229,
  serde_json 1.0.154 and reqwest 0.13.5; defaults disabled. Reqwest enables only
  blocking/rustls. M2b.1: exact Axum 0.8.9/Tokio 1.53.3/Hyper 1.12.0/hyper-util 0.1.21, defaults disabled. Only --serve owns an application runtime.
- [Tests](../tests/integration.rs), domain/fetch/normalization suites, fixture JSON
  and [transport tests](../src/market_data/transport/tests.rs) use deterministic seams.
- [CI](../.github/workflows/ci.yml): ubuntu-24.04, pinned checkout, read-only token,
  no persisted checkout credentials, 15-minute timeout, four separate Cargo gates.
- Quality gates: fmt --check, Clippy -D warnings, build and test; exact commands
  remain in AGENTS.md. Security architecture: [baseline](security/security-baseline.md).
- Detailed boundaries and ownership constraints: [architecture](architecture.md).

## 4. Milestone Status

| Milestone | Scope | Current status | Evidence | Known limitations |
| --- | --- | --- | --- | --- |
| 0.1a–0.1d | Harness, Cargo, CI | VERIFIED: specs 0001/0002 say IMPLEMENTED | [0001](specs/0001-harness-bootstrap.md), [0002](specs/0002-ci-bootstrap.md), committed files | Prior human acceptance is recorded, not newly granted here |
| 0.2a–0.2b | Adapter specification/architecture | VERIFIED: APPROVED / ACCEPTED | [0003](specs/0003-market-data-adapter.md), [ADR 0001](adr/0001-market-data-adapter.md) | Overall adapter closure remains pending |
| 0.2c–0.2e | Domain, normalization, orchestration | VERIFIED: committed core and successful hosted CI | HEAD and hosted run below | Does not include production transport |
| 0.2f | Production HTTP transport | VERIFIED: committed in current HEAD | Git/source; historical local gate evidence | No newly verified live connectivity or hosted transport execution |
| 0.2g / final 0.2 | Integration/security acceptance review | VERIFIED: recorded ACCEPT WITH LIMITATIONS | Spec evidence and W3.0 rerun: 60 passing tests | Reviewer recommendation; AC8/AC10 partial, human closure pending |
| Security baseline / ADR 0002 | Mandatory security principle and requirements | VERIFIED: documents present, ADR ACCEPTED and committed | [Baseline](security/security-baseline.md), [ADR 0002](adr/0002-security-by-design.md) | Policy is not complete operational enforcement |
| 0.2h | Local cargo-audit/Gitleaks evaluation | REPORTED: successful; evidence recorded | Baseline provenance/result tables | Scanners not rerun or original reports revalidated in this milestone |
| M0 / M0.1 | Freelance dashboard planning/refinement | APPROVED specification / ACCEPTED ADR through M1 review | [0005](specs/0005-freelance-portfolio-mvp.md), [ADR 0003](adr/0003-full-stack-portfolio-architecture.md) | Future Option B accepted; exact versions require compatibility/security review; no web implementation |
| M1 CLI | One observation using existing adapter | Human-accepted with limitations at M2a request | [0006](specs/0006-read-only-cli.md), [tests](../tests/cli.rs) | 73-test baseline reproduced; current hosted CI/Linux/isolation gaps remain |
| M2a | Pure exact portfolio valuation | Human-accepted before M2b.1 | [0007](specs/0007-exact-portfolio-valuation-domain.md), [tests](../tests/portfolio.rs) | No HTTP/serialization; caller supplies monotonic freshness metadata; conservative arithmetic capacity |
| M2b.1 | Local HTTP dashboard/valuation foundation | Human-accepted; final local 137-test verification reproduced | [0005 evidence](specs/0005-freelance-portfolio-mvp.md), [HTTP tests](../src/http/tests.rs) | No worker/refresh, frontend, Linux or hosted verification for these changes |
| Context v1 / W3.0 | Recovery entrypoint / career direction | VERIFIED: context v1 committed; W3.0 documentation prepared | Git and this file; portfolio roadmap | W3.0 accepted by human at consolidated checkpoint; no implementation authorization |

## 5. Current Repository State

M2b.1 checkpoint (2026-10-18): base `1d43a876e06fcfdcfc026ee3c6faec153a86febe`; hosted run 39040626584 verified for that older SHA. Product Owner accepted M2b.1 and authorized one commit/non-force push. Resolve the checkpoint SHA from Git and verify its hosted result separately.
Baseline 105/four gates reproduced; checkpoint rerun passes all four gates/137 tests (105 +30 HTTP +2 startup). Actual binary loopback smoke passed. Nine packages added; no prior version changes.
Fresh cargo-audit 0.22.2: 194 packages/zero findings, DB 999ec89d updated 2026-10-17. See 0005 for scope/features/security/TDD/limits. No provider request. These are pre-publication checks, not hosted checkpoint results; historical snapshots follow.

**VERIFIED** at W3.0 recovery on 2026-10-16:

- Branch: main; local origin/main points to HEAD. Remote freshness is unverified.
- Latest committed SHA: `7238c3e0fa8163a0b71f48a57ed2f4eda8e60305`.
- Commit subject: `improved feeling of context with chatgpt and codex`.
- Working tree/index were clean before W3.0. HEAD includes transport, dependencies,
  tests, security baseline/ADR and context v1 previously described as unpublished.
  Git inclusion does not establish human acceptance of adapter closure.
- W3.0 changes only this context and the portfolio roadmap. No source, tests,
  dependencies, CI, toolchain or accepted decisions are changed.
- Local W3.0 verification on 2026-10-16: cargo fmt --all -- --check;
  cargo clippy --locked --all-targets --all-features -- -D warnings;
  cargo build --locked --all-targets --all-features; cargo test --locked --all-features
  all passed. Tests: 60 passed, zero failed/ignored. Local links and Git diff checks
  passed. No live connectivity, OS network isolation or scanner rerun is claimed.
- Historical hosted evidence for `af007d8`: [run 38678079406](https://github.com/victorrusskikh96-byte/rust-crypto-monitor/actions/runs/38678079406).
  That result covers the older core checkpoint. Hosted CI for current HEAD has
  not been revalidated in W3.0; no current hosted success is inferred.
- No live provider request, installation, commit or push performed in W3.0.

M0 recovery on 2026-10-17: Git HEAD is
`0f95a3cf2fb638df88d382e298fc6364b8867df9`,
`feat: finalize market data adapter and web3 portfolio foundation`; main tracks
local origin/main and the working tree/index were clean before M0. This supersedes
the current-HEAD value in the preserved W3.0 snapshot above; remote freshness and
current hosted CI are unverified. Source still has an empty binary and no dashboard.
M0/M0.1 changes only two proposals and this context/roadmap; no application capability
or dependency is added. Pre-M0 local four-gate verification passed with 60 tests;
M0 verification is reported in the review response, without inferring hosted success.

M1 recovery: HEAD/local origin/main and read-only git ls-remote origin main all
match 0f95a3c on 2026-10-17. M0/M0.1's four unpublished documentation files were
preserved/refined; the index remains unchanged. Current source now includes the CLI
in 0006; the empty-main statement above is the historical M0 recovery snapshot.
M1 verification: all four exact Cargo gates passed on Windows, 73 tests passed
(60 existing +13 CLI), zero failed/ignored. CLI-first test baseline failed on missing
runner; platform fixtures were corrected to 100 ns SystemTime increments.
Document links/JSON/status/scope/whitespace checks passed. No provider request,
dependency change, commit or push performed. Current hosted CI, Linux execution,
OS network denial and scanner reruns are unverified.

M2a verification on 2026-10-17: baseline 73 tests/four gates reproduced first;
final four exact gates passed with 105 tests (73 unchanged +32 pure valuation).
Preservation hashes confirm CLI/core/dependencies/CI/prior tests/0005 unchanged.
No M2a provider calls, HTTP/JSON, scanner rerun, commits or pushes; review pending.
M1 is human-accepted with limitations; 0006 records that acceptance.

## 6. Architecture Decisions

- [ADR 0001 — Market Data Adapter](adr/0001-market-data-adapter.md): ACCEPTED.
- [ADR 0002 — Security by Design](adr/0002-security-by-design.md): ACCEPTED principle,
  committed in current HEAD; operational controls remain separately verified.

- [ADR 0003 — Full-Stack Portfolio Architecture](adr/0003-full-stack-portfolio-architecture.md):
  ACCEPTED through M1 Technical Lead authorization after checking M0.1 text.
  Future Axum/Tokio + React/TypeScript/Vite and bounded worker extend the historical
  CLI-only application baseline; synchronous adapter contract remains unchanged.
  [0005](specs/0005-freelance-portfolio-mvp.md) is APPROVED, not IMPLEMENTED.
  Exact dependencies remain verification candidates; M1 adds no web/runtime packages.

Read the records themselves before dependent work; this index does not amend them.
## 7. Security and Financial Boundaries

Security by Design is mandatory. Review relevant trust boundaries, untrusted inputs,
resource limits, dependency/source/features and residual risks at every milestone.
Public, read-only market data only. No unauthorized trading, account credentials,
wallet access, signing, withdrawals or blockchain/mainnet operations. Financial
capabilities require explicit approval and separately approved specifications/decisions;
future safeguards are requirements, not permission or implemented features.
Never place secrets in source, fixtures, prompts, logs or reports.

**VERIFIED** configuration includes TLS verification, fixed HTTPS destination,
no redirects/proxy inheritance/decompression/configurable retries, disabled idle
pooling, bounded reads and safe errors. Live enforcement is not proven by fake tests.
See [security baseline](security/security-baseline.md) for CURRENT/FUTURE controls,
scan provenance and gaps; zero scanner findings do not establish complete security.

## 8. Open Issues and Limitations

- **VERIFIED:** specification 0003 AC1–AC7/AC9 PASS; AC8/AC10 PARTIAL per its evidence.
- AC8: deterministic tests pass, but OS-enforced external-network-denied execution
  is not established. Cargo --offline is not process network isolation.
- AC10: milestone acceptance with limitations does not establish full specification
  closure or complete AC1–AC10 satisfaction; keep APPROVED.
- A later user-requested BTC CLI run succeeded (prior tool evidence; not rerun in
  M2a). This proves one observation only. DNS/TLS rejection, repeatable availability,
  regional coverage, wire behavior and elapsed deadlines remain unverified; configured timeouts are not hard real-time.
- Body cap bounds application-consumed bytes, not every HTTP/kernel buffer.
- Blocking transport must be created/used/dropped outside an async runtime.
- Hosted Ubuntu transport/scanner execution, confidential vulnerability intake,
  security CI, dependency monitoring and operational isolation remain incomplete.
- **REPORTED:** cargo-audit 0.22.2 scanned 185 packages with zero advisories/warnings;
  Gitleaks 8.30.1 found zero working-tree/reachable-history secrets. Results are
  snapshot/scope limited; recorded provenance does not make them perpetual checks.
- README retains a historical empty-binary hosted-coverage sentence; the newer
  Phase 0.2e run covers the committed core. Security baseline's earlier local-scan
  recommendation is historical and superseded by its executed-evaluation section.
- No critical integration blocker is recorded; incomplete evidence is not a PASS.

## 9. Next Authorized Actions

- Completed: committed core; local transport/integration; security documentation;
  recorded scanner evaluation; this context entrypoint and local verification.
- W3.0 is human-accepted. The consolidated checkpoint request accepts 0.2f,
  0.2g with limitations, 0.2h, Security Baseline v1 and Context Management v1;
  it authorizes exactly one checkpoint commit and a non-force push to origin/main.
  This does not establish complete AC1–AC10 satisfaction or authorize CLI/Solana
  implementation, CI changes or new repository creation.
- **VERIFIED:** Git now contains the adapter/security checkpoint in HEAD. Remaining
  acceptance and verification gaps are not closed merely because it was committed.
- M1/M2a/M2b.1 are accepted. Current authorization: verify, create exactly one M2b.1 commit, push normally to origin/main and verify hosted CI, then stop.
  Worker/refresh needs separate M2b.2 scope; no new features, dependency changes,
  live provider calls, frontend, corrective commits or deployment.
- Adapter AC8/AC10, hosted CI/security-tool/operational gaps remain. Optional Solana,
  polling, credentials, trading and wallet operations remain outside current scope.

## 10. Context Recovery Instructions

1. Read this file and AGENTS.md; treat this snapshot as a map, not current proof.
2. Verify branch, HEAD, staged/unstaged/untracked files and remote tracking state:
   git status --short --branch --untracked-files=all; git rev-parse HEAD;
   git log -5 --oneline. Inspect the index/diff before editing; preserve existing work.
3. Query hosted CI for the exact current commit; do not infer success from another SHA
   or a workflow definition. If unavailable, label the result REPORTED or unverified.
4. Read README/architecture, relevant specs, accepted ADRs and applicable security
   requirements. Inspect actual source/tests for the requested milestone.
5. Reconcile stale statuses against Git, executed checks and explicit human acceptance.
   Distinguish local implementation, published evidence and planned work.
6. Continue from the most recently verified checkpoint within current authorization.
   Ask for missing approval only when needed; never treat documentation as permission.

## Maintenance Policy

Update after accepted milestones and material architecture/security decisions; record
material open issues and exact evidence scope/date. Keep historical evidence in specs
and ADRs, preserve unrelated history, and keep this entrypoint concise (roughly
150–250 lines maximum). Recheck SHA/CI/tests rather than copying old claims forward.
Do not silently promote REPORTED to VERIFIED or local work to published work.
