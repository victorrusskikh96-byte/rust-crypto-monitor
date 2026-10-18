# Rust Crypto Monitor

A working one-observation Rust CLI for public cryptocurrency market data, with an accepted future full-stack dashboard architecture. Development uses a human-reviewed, incremental specification-driven workflow with Codex.

## Current phase — M2b.1 local HTTP foundation

The CLI invocation validates exactly one pair, constructs the existing production
adapter and requests one observation. M2a adds a pure portfolio valuation library,
independent of the CLI. M2b.1 adds a bounded local HTTP/1.1 server and two JSON
endpoints. Provider refresh, worker integration, frontend, persistence and polling
remain deferred. Specification 0005 stays APPROVED; the full MVP is incomplete.
M1/M2a and the narrow M2b.1 implementation are human-accepted. The Product Owner
authorized one M2b.1 checkpoint commit/push; subsequent features need separate scope.

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

## Run the local API (M2b.1)

From the repository root with the unchanged pinned Rust 1.99.0 toolchain:

```powershell
cargo run --locked -- --serve
```

The server listens only on **http://127.0.0.1:3000**. Stop it with Ctrl-C.
An occupied port fails closed with exit 3 and a static diagnostic. Existing
`cargo run --locked -- "BTC/USDT"` / `"ETH/USDT"` CLI behavior is preserved.
The API server constructs no provider transport and never fetches market data.
Its initial observations remain empty; a positive portfolio is incomplete, while
zero holdings produce an exact zero total. Fresh prices are injected only in tests.
There is no browser UI or refresh endpoint in this milestone.

In another PowerShell terminal:

```powershell
$dashboard = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/v1/dashboard'
$payload = @{
    snapshot_id = $dashboard.snapshot_id
    quantities = @{ BTC = '0'; ETH = '0' }
} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/valuation' -ContentType 'application/json' -Headers @{ Origin = 'http://127.0.0.1:3000' } -Body $payload
```

GET returns schema version 1, an opaque run-scoped snapshot ID, and exactly BTC/ETH
entries with null observations/timestamps and `not_attempted`. POST accepts only
that snapshot ID and both quantity strings; zero holdings return `state: complete`,
`total: "0"` and null allocations. Positive missing/stale quotes return incomplete
with null total; mismatched IDs return 409. Monetary values are always strings.
See [0005 contracts and M2b.1 evidence](docs/specs/0005-freelance-portfolio-mvp.md).

Host must be exactly `127.0.0.1:3000`; POST requires Origin
`http://127.0.0.1:3000`. GET may omit Origin. `localhost` aliases and the future
Vite origin are rejected. No CORS permission is emitted. Each connection serves
one request, then closes. Limits: 32 tracked connections, 8 admitted handlers,
5 seconds combined header/body reading, 25 seconds handling/response writing,
4 KiB body, 16 KiB headers/64 fields, 2 KiB target and 32 KiB JSON response.
Early parser failures and expired budgets close the socket without a response;
application errors use sanitized JSON. Every emitted response has `no-store`.
`ready` describes the API process, not provider availability; cooldown `"0"`
does not enable the absent refresh route. Loopback/Host/Origin checks provide no
authentication against local processes.

Windows verification: all four Cargo gates passed, **137 tests passed**
(105 preserved +30 HTTP +2 executable startup). Controlled-clock tests exercise
actual loopback connections; the actual `--serve` binary also passed a loopback
smoke check. Final checkpoint verification reproduced all four gates/137 tests.
No live provider calls were made. Hosted results for the checkpoint are verified
after publication and reported separately; no hosted success is inferred here.
OS-enforced outbound network denial and actual OS Ctrl-C behavior remain unverified.

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
