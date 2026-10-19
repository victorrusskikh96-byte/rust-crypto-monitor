# Rust Crypto Monitor

A working one-observation Rust CLI for public cryptocurrency market data, with an accepted future full-stack dashboard architecture. Development uses a human-reviewed, incremental specification-driven workflow with Codex.

## Current phase — M3.1 React foundation (local review pending)

M2c and all earlier milestones are Product Owner-accepted. The verified M3.1
starting checkpoint is clean main at
`3f76710df5b0cda6ebbe9ad7dfc1da098dbde06e`, matching local origin/main.
M3.1 adds a minimal React shell, runtime API contracts, a strict local Vite proxy
and an explicit Rust development-Origin policy. The synchronous adapter, exact
portfolio arithmetic and offline fixture semantics are preserved.
Specification 0005 stays APPROVED; the complete Full-Stack MVP is not released.
M3.1 is locally verified and awaits independent Technical Lead source review.
The Product Owner authorized one M3.1 checkpoint commit, one normal push and
exact-commit hosted CI verification. CI workflows are unchanged and run Rust
quality gates only; React typecheck/build/Vitest evidence is local-only.
Browser E2E, visual audit and deployment remain pending.

## Fixture-only frontend development (M3.1)

Use exactly **Node.js 24.22.0 LTS and bundled npm 11.19.1**, plus the pinned Rust
1.99.0 toolchain. No browser installation is needed. See the
[dependency/security review](docs/security/m31-frontend-dependencies.md) for pins,
verified distribution integrity, script restrictions, native packages and limits.

From the repository root, install the reviewed lock without lifecycle scripts:

```powershell
npm ci --ignore-scripts --no-fund --engine-strict --prefix frontend
```

In one terminal start only the synthetic Rust server:

```powershell
cargo run --locked -- --serve --fixture success --dev-ui
```

In another terminal start the local frontend:

```powershell
npm run dev --prefix frontend
```

Open **http://127.0.0.1:5173** manually. Both ports must be free; occupied ports
fail closed. Stop only your servers with Ctrl-C. Do not substitute localhost,
change ports or expose the listener. HMR and WebSockets are disabled; reload
manually after edits. GET on load does not refresh markets. The success fixture
starts with empty observations and is clearly labeled synthetic. The shell shows
loading, safe disconnection, API/worker status, mode, scenario and snapshot identity.
It does not yet provide market cards, valuation forms or refresh controls.

The closed Origin policies are mutually exclusive:

| Startup | Allowed Origin | Backend Host |
| --- | --- | --- |
| `--serve` | `http://127.0.0.1:3000` | `127.0.0.1:3000` |
| `--serve --fixture success` | `http://127.0.0.1:3000` | `127.0.0.1:3000` |
| `--serve --dev-ui` | `http://127.0.0.1:5173` | `127.0.0.1:3000` |
| `--serve --fixture success --dev-ui` | `http://127.0.0.1:5173` | `127.0.0.1:3000` |

Other existing fixture names work only in the same position before --dev-ui.
No-Origin GET remains available for local tools. POST requires one exact allowed
Origin and application/json. Vite accepts only Host 127.0.0.1:5173, rejects
forwarded authorities, serves only the frontend allowlist and denies sensitive
files. Only /api/v1/ proxies to fixed http://127.0.0.1:3000. It rewrites Host,
preserves Origin including absence, and supplies no permissive CORS policy.
There is no browser-configurable API destination or provider request.

## Frontend verification

Run the existing four Rust gates below first, sequentially, including build so
the fixture executable exists. Then run:

```powershell
npm run typecheck --prefix frontend
npm run build --prefix frontend
npm test --prefix frontend
```

Vitest uses at most two workers and serial test files. Its fixed-port proxy and
fixture integration tests require 3000 and 5173 free and never kill an existing
owner. The fixture smoke supervises/reaps only its own Rust process, uses actual
Vite/HTTP and renders React in jsdom. This is not browser E2E or visual testing.
node_modules, Vite caches and dist are ignored. The production build is verified;
Rust serving built assets remains future scope. The development CSP permits local
inline CSS injection, while scripts and connections remain self-only.

See the [M3.1 report](docs/M31_IMPLEMENTATION_REPORT.md) and
[specification evidence](docs/specs/0005-freelance-portfolio-mvp.md) for executed
checks and remaining limitations. Proposed next slice: M3.2 Market Dashboard,
subject to its own specification and approval.
## Exact portfolio domain (M2a)

[portfolio.rs](src/portfolio.rs) exposes validated Quantity, explicit BTC/ETH
Portfolio slots, supplied Quote metadata and read-only valuation results.
Quantities accept unsigned ASCII decimal text, <=32 bytes, <=8 fractional digits,
0..=1000000; zero is valid. No exponent, sign, whitespace or binary floating point.
Monetary values are exact canonical USDT strings through Display; only allocation
rounds, independently half-even to two percentage decimals. Monetary formatter
precision cannot hide digits.

BTC 0.1 at 65000.12 plus ETH 2 at 2500.00000001 yields exactly
11500.01200002 USDT, with allocations 56.52/43.48. A positive holding with a
missing/stale quote produces an incomplete result, no total and no allocations;
zero holdings need no quote. Freshness requires supplied monotonic age <=60 seconds
and latest fetch success; the pure domain never reads clocks or fetches data.
The caller is responsible for honest age/attempt metadata, not wall timestamps.

Products, scale alignment and sums use checked u128 coefficients and require an
exact final 96-bit coefficient/scale <=28. ArithmeticCapacity and
UnrepresentableValue are distinct typed errors. The approved conservative
intermediate limit can reject mathematically representable extreme products.
No silently rounded monetary result or default missing price is returned.
The domain itself has no JSON serialization or CLI portfolio command; the HTTP
boundary serializes its exact Display values.
See [M2a scope/precision review](docs/specs/0007-exact-portfolio-valuation-domain.md)
and [deterministic portfolio tests](tests/portfolio.rs).

M2a local verification: all four required Cargo gates pass; 105 tests pass
(73 unchanged +32 valuation). Tests cover precision failures, half-even allocation,
quote freshness/incompleteness and bounded inputs with no live network calls.
M2a was human-accepted before M2b.1; the earlier verification evidence is preserved.

## Run the local API (M2b.2)

From the repository root with the unchanged pinned Rust 1.99.0 toolchain:

```powershell
cargo run --locked -- --serve
```

The server listens only on **http://127.0.0.1:3000**. Stop it with Ctrl-C.
An occupied port fails closed with exit 3 and a static diagnostic. Existing
`cargo run --locked -- "BTC/USDT"` / `"ETH/USDT"` CLI behavior is preserved.
Before listening, one dedicated worker constructs the production transport outside
Tokio. Startup and GET/valuation cause no provider requests. Observations initially
remain empty; positive holdings are incomplete and zero holdings total exactly zero.
Only an admitted POST refresh requests public BTC/USDT, then ETH/USDT. No browser UI
or fixture fallback is provided.

In another PowerShell terminal:

```powershell
$dashboard = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/v1/dashboard'
$payload = @{
    snapshot_id = $dashboard.snapshot_id
    quantities = @{ BTC = '0'; ETH = '0' }
} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/valuation' -ContentType 'application/json' -Headers @{ Origin = 'http://127.0.0.1:3000' } -Body $payload
```

Initially, GET returns schema version 1, an opaque run-scoped snapshot ID, and
exactly BTC/ETH entries with null observations/timestamps and `not_attempted`.
POST valuation accepts only
that snapshot ID and both quantity strings; zero holdings return `state: complete`,
`total: "0"` and null allocations. Positive missing/stale quotes return incomplete
with null total; mismatched IDs return 409. Monetary values are always strings.
See [0005 contracts and implementation evidence](docs/specs/0005-freelance-portfolio-mvp.md).

Host must be exactly `127.0.0.1:3000`; POST requires Origin
`http://127.0.0.1:3000`. GET may omit Origin. `localhost` aliases and the future
Vite origin are rejected. No CORS permission is emitted. Each connection serves
one request, then closes. Limits: 32 tracked connections, 8 admitted handlers,
5 seconds combined header/body reading, 25 seconds handling/response writing,
4 KiB body, 16 KiB headers/64 fields, 2 KiB target and 32 KiB JSON response.
Early parser failures and expired budgets close the socket; an expired refresh
waiter can emit a sanitized 504 when the socket permits one immediate write.
Every emitted response has `no-store`. `ready` describes API/worker readiness,
not global Binance availability. Loopback/Host/Origin checks provide no
authentication against local processes.

To explicitly fetch public provider data, submit the exact empty JSON object:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/refresh' -ContentType 'application/json' -Headers @{ Origin = 'http://127.0.0.1:3000' } -Body '{}'
```

This command makes up to two real public requests when admitted; it was **not run
against Binance during M2b.2**. Reread the dashboard before an explicit valuation.
Refresh returns 200 for completed batches, including safe per-pair failures;
409 while busy; 429 during cooldown, with retry_after_ms and ceil-second Retry-After;
503 if stopping/unavailable; or 504 if its HTTP waiter expires while work continues.
Neither disconnect nor timeout releases admission or causes a retry.

The worker owns client construction, reuse and destruction. A capacity-one channel
and one atomic admission transition prevent a second batch from queuing. GET stays
responsive during fetches; no snapshot lock covers provider I/O. Pair loading starts
only at an actual call; its previous error, if retained, has last_error_is_previous
set true during loading. Ordinary failure continues to ETH; 418/429 stops remaining
calls. Untouched pairs retain their attempt metadata. Health reports observed
outcomes, with safe top-level service errors for worker failure.

Batch starts are at least 30 seconds apart. Provider rate limiting adds at least
60 seconds from failure, or a greater valid Retry-After, using checked monotonic
deadlines. Missing/zero/invalid metadata cannot bypass cooldown. An unrepresentable
deadline disables refresh until restart with cooldown_unrepresentable. Restart is
not guidance to evade provider quotas; shared-IP compliance is unverified.

Observations are fresh through exactly 60 seconds of monotonic receipt age. Later
expiry or a failed latest attempt makes a retained price explicitly stale. Snapshot
IDs change on refresh/service mutations; expiry can invalidate valuation without
changing ID. Valuation copies a consistent snapshot, rejects active refresh and
replaced IDs, excludes stale positive holdings, and never fetches data.

Ctrl-C closes acceptance and command admission. Unstarted work is discarded without
attempts; a running call publishes its actual outcome, then skips remaining calls.
HTTP waiters receive 503 when possible. After the bounded connection drain and
application runtime shutdown, the synchronous owner joins the worker. Blocking
OS/DNS operations can delay that join; there is no hard worker shutdown deadline.
Worker initialization failure prevents listening. Unexpected termination disables
refresh without respawning; GET remains available after runtime worker failure.

M2b.2 Windows verification: all four required Cargo gates passed; **156 tests
passed**, zero failed/ignored (137 preserved +19 deterministic worker/state tests).
Tests use fake transport, controlled clocks and synchronization gates; no live
Binance requests. Production transport, financial domain, CLI, dependency graph
and CI are unchanged. Fresh cargo-audit: 194 packages, zero vulnerabilities/warnings;
see 0005 for dated database evidence and the secret-scan scope.

Historical M2b.1 evidence remains in 0005: 137 tests/four gates and a real-binary
loopback smoke passed. Its smoke process was terminated; actual OS Ctrl-C remains
unverified. M2b.2 does not claim Linux/hosted execution, OS-enforced egress denial,
live DNS/TLS/provider availability, frontend readiness or complete security.
The backend is ready for milestone review before separately authorized M3 UI work.

## Run an offline demonstration (M2c)

Run exactly one scenario at a time; stop the server before selecting another:

```powershell
cargo run --locked -- --serve --fixture success
cargo run --locked -- --serve --fixture partial
cargo run --locked -- --serve --fixture stale
cargo run --locked -- --serve --fixture timeout
cargo run --locked -- --serve --fixture rate-limit
cargo run --locked -- --serve --fixture unavailable
```

These commands never construct a production HTTP client or request Binance.
They use fixed **synthetic data**, the existing adapter/portfolio domain and the
same worker, loopback listener, Host/Origin validation and resource limits.
Unknown, non-Unicode, reordered, missing or extra server arguments exit 2 before
starting a runtime, client or listener. No URLs or fixture paths are accepted.
Real CLI and `--serve` behavior remain unchanged; there is no fallback between modes.

| Scenario | Initial GET | After explicit POST refresh |
| --- | --- | --- |
| success | Both unavailable/not_attempted | Both success; BTC 65000.12 and ETH 2500.00000001 USDT |
| partial | Both unavailable/not_attempted | BTC success; ETH unavailable/failed with provider_timeout |
| stale | Both stale with seeded synthetic observations; no attempts | Both remain stale; simulated provider_timeout attempts retain the old observations |
| timeout | Both unavailable/not_attempted | Both unavailable/failed with provider_timeout |
| rate-limit | Both unavailable/not_attempted | BTC simulated 429/provider_rate_limited with Retry-After 120 seconds; ETH remains not_attempted |
| unavailable | Both unavailable/not_attempted | Both unavailable/failed with simulated 503/provider_unavailable |

With the fixture server running, use the same manual refresh endpoint:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/refresh' -ContentType 'application/json' -Headers @{ Origin = 'http://127.0.0.1:3000' } -Body '{}'
$dashboard = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/v1/dashboard'
$payload = @{
    snapshot_id = $dashboard.snapshot_id
    quantities = @{ BTC = '0.1'; ETH = '2' }
} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/valuation' -ContentType 'application/json' -Headers @{ Origin = 'http://127.0.0.1:3000' } -Body $payload
```

Every emitted fixture application response (including valuation and errors) adds
`mode: "fixture"`, `provenance: "fixture"` and
`fixture: {scenario, notice}`. The notice explicitly labels prices/timestamps as
synthetic and health as simulated local outcomes, never global Binance availability.
Observations retain the approved `provider: "Binance"` schema and each has
`provenance: "fixture"`; this is simulated attribution, not provider evidence.

Wall timestamp labels start at synthetic Unix milliseconds `1792195200000` and
advance by monotonic process elapsed time. They are never current/live timestamps.
The stale seed starts 60,001 ms old, with observation timestamp
`1792195139999`, null last_attempt_at_ms and not_attempted. Its last_success_at_ms
identifies the seeded synthetic observation only; no provider or simulated request
occurred at startup. A manual stale refresh adds simulated failed attempt metadata.

Completed simulated failures return HTTP 200 with per-pair errors. A second refresh
returns local HTTP 429 during the unchanged 30-second start interval, or during the
rate-limit scenario's 120-second cooldown; Retry-After is retained. No polling,
automatic retry, network latency or prolonged loading is simulated. After a cooldown,
another explicit refresh repeats the selected scenario. Restart resets all state.
Freshness is still monotonic: quotes are fresh through exactly 60 seconds and stale
afterward; reread and explicitly calculate using the latest snapshot ID.

For success, BTC 0.1 plus ETH 2 yields exactly **11500.01200002 USDT**
(6500.012 + 5000.00000002), allocations 56.52/43.48. Partial preserves BTC's exact
value but withholds total/allocations for positive missing ETH. Stale positive
holdings never enter a current total. Both zero quantities total exactly zero in
every scenario, including without observations.

M2c checkpoint verification: all four Cargo gates pass with 169 tests; the
separate parallel startup suite passes. A compiled success-fixture smoke verified
synthetic dashboard/refresh and the exact example valuation, then stopped/reaped
only its own child. No provider requests. The accepted startup-test fix requires
owned port reservations and supervises every startup child with a 30-second deadline.
M2c verification and security evidence is recorded in
[specification 0005](docs/specs/0005-freelance-portfolio-mvp.md).
The React dashboard, persistent fixture banner, Vite integration and full MVP
acceptance remain separate work.

## Run the CLI

From the repository root, with pinned Rust 1.99.0 and its native build prerequisites:

```powershell
cargo run --locked -- "BTC/USDT"
cargo run --locked -- "ETH/USDT"
```

Each valid command uses the production public Binance endpoint once and therefore
requires permitted network/provider access. These commands were **not executed
against Binance in M1**. Success writes four lines to stdout and exits 0:

```text
pair: BTC/USDT
price: 65000.12 USDT
provider: Binance
observed_at_unix_seconds_utc: 1700000000.123456700
```

This is a synthetic contract example, not a captured live observation. Actual price
and time vary. Price is exact canonical decimal text in USDT per base unit; USDT
is not USD. Time is signed Unix/POSIX seconds since 1970-01-01T00:00:00Z, displayed
with nine fractional digits using integer arithmetic. Display precision is not
clock accuracy (Windows SystemTime has 100 ns representation granularity).
It is local receipt metadata, not exchange event time or proof of freshness.

Exactly one case-sensitive canonical pair is required; aliases, whitespace,
unsupported pairs, missing/extra/non-Unicode arguments and flags are rejected
before production client construction or network access. Invalid usage writes:

```text
Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>
```

| Exit | Meaning |
| --- | --- |
| 0 | Observation written successfully |
| 2 | Argument error; static usage on stderr |
| 3 | Configuration/client/domain/provider/transport error; sanitized error on stderr |
| 4 | Output/diagnostic write failure; best-effort static diagnostic |

For example, a timeout prints `error: market data request timed out` to stderr.
Argument/fetch errors produce no success stdout. Output failure can leave partial
stdout; stderr itself may be unavailable. There are no retries or default prices.
Defaults remain 3-second connection and 10-second total HTTP budgets, not hard
wall-clock guarantees across DNS, OS scheduling, construction or terminal output.

Deterministic CLI tests inject fixture transport and fixed clocks; they never
call the production fetch path for valid arguments. Subprocess tests invoke only
argument failures. Reproduce them with:

```powershell
cargo test --locked --offline --test cli
```

Cargo offline mode is not OS network isolation. Tests do not establish live
provider availability, real TLS/deadline behavior or Linux execution.
See [CLI specification 0006](docs/specs/0006-read-only-cli.md) and
[CLI acceptance tests](tests/cli.rs). M1 is human-accepted with limitations.

## Historical adapter checkpoint (before M1)
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
- [Approved Full-Stack MVP specification](docs/specs/0005-freelance-portfolio-mvp.md)
- [Accepted Full-Stack architecture ADR](docs/adr/0003-full-stack-portfolio-architecture.md)
- [Approved CLI specification](docs/specs/0006-read-only-cli.md)

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

M1 local verification on Windows: all four exact Cargo gates passed; 73 tests
passed (60 existing adapter tests +13 CLI tests), none failed or ignored.
New CLI tests cover both fixtures, argument/non-Unicode rejection, exact price and
UTC timestamp output, every domain error, transport single-attempt failures,
stdout/stderr failures and actual executable argument exit codes. No live requests
or current hosted CI verification were performed; Linux execution remains unverified.

## Security by Design
Security by Design is mandatory for every milestone. See the [security baseline](docs/security/security-baseline.md) for current requirements, evidence/gaps, future financial safeguards and the incremental security-tooling plan, and [ADR 0002](docs/adr/0002-security-by-design.md) for the architectural decision. Planned controls and tools are not implementation claims or authorization for trading.

## Safety boundaries
No live trading, real orders, exchange or wallet credentials, signing, blockchain transaction execution, or mainnet operations or deployments. Future simulation, if approved, is paper trading only. No commits, pushes, publishing, or deployments without explicit approval.

## Continuous integration
[CI workflow](.github/workflows/ci.yml) runs on push and pull requests, using one ubuntu-24.04 job with Rust 1.99.0 and the four commands above. The official checkout action is pinned to a v7 commit, with credential persistence disabled. Only contents: read token permission is granted. Any failed required check fails the job; timeout is 15 minutes. Cargo.lock is included in the initial commit; CI never regenerates it. There is no deployment, cache, or CI matrix.

The .yml file uses JSON-formatted YAML for dependency-free local parsing. Syntax and structural checks do not establish hosted execution. Origin is configured for the project repository. [Hosted run 38555819823](https://github.com/victorrusskikh96-byte/rust-crypto-monitor/actions/runs/38555819823) succeeded for commit `19b7cf17302f7ee3ad9b3c2377483e446a96b92c`; GitHub API verification confirmed Formatting, Clippy, Build, and Tests all passed. The human confirmed prior acceptance of phases 0.1a–0.1d. Future commits, publication, and milestone closure still require explicit approval.
