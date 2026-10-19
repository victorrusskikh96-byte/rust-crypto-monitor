# Rust Crypto Monitor — Project Context

Snapshot: 2026-10-19 (M2c accepted; M3.1 locally verified, publication checkpoint authorized, independent review pending). Recovery map only: reconcile with Git, approved specifications, accepted ADRs and current human authorization.

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
  current code has the synchronous CLI, pure valuation and bounded local HTTP API
  with explicit worker refresh. M3.1 adds a minimal React shell and strict local Vite integration.
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
- [HTTP](../src/http/mod.rs): --serve, IPv4 loopback:3000, dashboard/valuation/refresh;
  current-thread runtime, 32 connections/8 handlers, bounded bodies and deadlines.
  Mutable two-market snapshot; initial GET/valuation never fetch.
- [Worker](../src/http/worker.rs): one thread constructs/uses/drops blocking transport
  outside Tokio; capacity-one channel and single admission, BTC then ETH, no retries.
  Monotonic 30-second starts/60-second freshness, conservative 418/429 cooldown;
  disconnect/HTTP timeout retain admission. Runtime shutdown precedes worker join.
  Valuation copies one generation and excludes stale prices.
- M2c --serve --fixture selects six fixed synthetic scenarios via a factory boundary
  that excludes production client construction. Shared worker/admission/security;
  simulated wall labels, monotonic freshness/cooldown and API fixture notices.
  [Implementation/tests](../src/http/fixture.rs); [contracts/evidence](specs/0005-freelance-portfolio-mvp.md).
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
| 0.2c–0.2e | Domain, normalization, orchestration | VERIFIED: committed core and successful hosted CI | Historical specification evidence | Does not include production transport |
| 0.2f | Production HTTP transport | VERIFIED: committed in current HEAD | Git/source; historical local gate evidence | No newly verified live connectivity or hosted transport execution |
| 0.2g / final 0.2 | Integration/security acceptance review | VERIFIED: recorded ACCEPT WITH LIMITATIONS | Spec evidence and W3.0 rerun: 60 passing tests | Reviewer recommendation; AC8/AC10 partial, human closure pending |
| Security baseline / ADR 0002 | Mandatory security principle and requirements | VERIFIED: documents present, ADR ACCEPTED and committed | [Baseline](security/security-baseline.md), [ADR 0002](adr/0002-security-by-design.md) | Policy is not complete operational enforcement |
| 0.2h | Local cargo-audit/Gitleaks evaluation | REPORTED: successful; evidence recorded | Baseline provenance/result tables | Scanners not rerun or original reports revalidated in this milestone |
| M0 / M0.1 | Freelance dashboard planning/refinement | APPROVED specification / ACCEPTED ADR through M1 review | [0005](specs/0005-freelance-portfolio-mvp.md), [ADR 0003](adr/0003-full-stack-portfolio-architecture.md) | Future Option B accepted; exact versions require compatibility/security review; no web implementation |
| M1 CLI | One observation using existing adapter | Human-accepted with limitations at M2a request | [0006](specs/0006-read-only-cli.md), [tests](../tests/cli.rs) | 73-test baseline reproduced; current hosted CI/Linux/isolation gaps remain |
| M2a | Pure exact portfolio valuation | Human-accepted before M2b.1 | [0007](specs/0007-exact-portfolio-valuation-domain.md), [tests](../tests/portfolio.rs) | No HTTP/serialization; caller supplies monotonic freshness metadata; conservative arithmetic capacity |
| M2b.1 | Local HTTP foundation | Human-accepted; published checkpoint matches Git | [0005 evidence](specs/0005-freelance-portfolio-mvp.md), [HTTP tests](../src/http/tests.rs) | Historical 137-test baseline; Linux/operational gaps preserved |
| M2b.2 | Bounded worker, refresh and state | Human-accepted in M2c request | [Worker tests](../src/http/worker_tests.rs), 0005 evidence | Independent source review/hosted success REPORTED by human; 156 baseline tests reproduced |
| M2c | Operational offline fixture mode | Product Owner-accepted in M3.1 authorization | [Tests](../src/http/fixture_tests.rs), 0005 M2c evidence | No frontend, M2c hosted/Linux evidence or OS egress-denial proof |
| M3.1 | React foundation, strict Vite proxy and closed dev Origin | Local implementation; Technical Lead review pending | [Report](M31_IMPLEMENTATION_REPORT.md), [dependency review](security/m31-frontend-dependencies.md) | No complete dashboard, browser E2E, Linux reproduction or release |
| Context v1 / W3.0 | Recovery entrypoint / career direction | VERIFIED: context v1 committed; W3.0 documentation prepared | Git and this file; portfolio roadmap | W3.0 accepted by human at consolidated checkpoint; no implementation authorization |

## 5. Current Repository State

**VERIFIED** M3.1 entry: clean main and empty index at
`3f76710df5b0cda6ebbe9ad7dfc1da098dbde06e`, matching local origin/main and expected
origin URL. Remote freshness/hosted CI was not newly queried. M2c and all earlier
milestones are **human-accepted** in the current Product Owner authorization.
Historical M2c/M2c.1 evidence remains in specification 0005.

At pre-publication checkpoint preparation, M3.1 changes are local and uncommitted. Node is now exactly 24.22.0 with bundled
npm 11.19.1; official MSI checksum/Authenticode verified, Codex 0.163.0 unchanged.
Frontend has 13 exact approved pins, script-disabled reproducible ci and a reviewed
121-entry lock (108 transitives including platform optionals; 96 installed on
Windows). Runtime decoders preserve decimal strings and reject unsupported input.
One initial relative dashboard GET; no refresh/retry/polling or provider call.

Rust adds only closed DevUi/DevUiFixture startup variants. Vite is loopback5173,
fixed /api/v1/ -> loopback3000, exact Host guard before file/proxy middleware,
Origin preserved, HMR/WebSockets/CORS disabled. Production Origin remains3000;
development Origin is exclusively5173. Production static asset serving is deferred.
See [M3.1 report](M31_IMPLEMENTATION_REPORT.md) for executed gates, integration and
review limitations; [dependency evidence](security/m31-frontend-dependencies.md)
records toolchain, scripts, licenses, advisories and native package limits.
No Cargo dependency, financial arithmetic, adapter, worker, fixture semantics,
CI workflow or deployment changed. Publication is separately authorized below.
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
- Blocking transport is owned outside Tokio. Worker join has no hard deadline
  across OS/DNS operations; actual OS Ctrl-C remains unverified.
- M2c is accepted. M3.1 implements dev Origin/Vite proxy; static production assets, full dashboard and browser E2E remain deferred.
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

- Product Owner authorized final M3.1 verification, exactly one commit named
  feat: add react frontend foundation and secure dev proxy, one normal non-force
  push to origin/main, and GitHub Actions verification for that exact SHA. Base:
  3f76710df5b0cda6ebbe9ad7dfc1da098dbde06e. Stop afterward for independent
  Technical Lead source review; publication does not establish acceptance.
- No application/dependency/CI change, Node reinstall, additional commit/amend,
  rebase/force-push, browser install, live Binance request or deployment. A material
  defect, security regression, remote divergence or scope conflict stops publication.
- All four Cargo gates/176 tests and local frontend typecheck/build/85 tests plus
  focused Vite security15 tests passed at this checkpoint. npm ci reproduced the
  unchanged lock with scripts disabled; npm audit reported zero findings.
- Existing hosted CI runs Rust only. React gates/integration remain local-only.
  Exact published SHA and hosted URL/conclusions belong in the final checkpoint
  response; do not create a follow-up commit to backfill future results.
- M3.1 is not human-accepted yet; specification 0005 remains APPROVED and full MVP
  release gates remain open. M3.2 Market Dashboard is a recommendation requiring
  separately approved scope; do not start it from this recovery map.
- Reproduce fixture development using README's exact Node/npm and startup commands.
  Preserve loopback ports, closed Origin policies, lockfile and script-disabled ci.
- Adapter AC8/AC10, browser/visual evidence, Linux/clean-checkout parity, production
  assets, native binary assurance and continuing security monitoring remain open.
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
