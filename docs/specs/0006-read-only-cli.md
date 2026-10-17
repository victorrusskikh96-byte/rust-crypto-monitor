# 0006 — Working Read-Only CLI

## Status
IMPLEMENTED. M1 implementation was authorized on 2026-10-17; CLI1-CLI6 have
deterministic evidence and the Technical Lead accepted M1 with limitations in the
M2a request. The 73-test baseline and all four gates were reproduced before M2a.
This accepts the CLI milestone, not adapter/full-stack closure or publication.
Historical M1 review-pending statements below describe the earlier evidence snapshot.

## Problem and goals
The production adapter exists but main is empty. Expose one on-demand observation
for exactly BTC/USDT or ETH/USDT, retaining the adapter unchanged. This CLI is the
current M1 step; the accepted full-stack direction in [0005](0005-freelance-portfolio-mvp.md)
remains future work, with no web dependency or implementation authorization now.

## Functional requirements
- Accept exactly one positional OS argument after program name. Require a valid
  Unicode canonical Pair via the existing parser; no trimming, aliases or flags.
  Missing, extra, unsupported/non-Unicode input returns code 2 before constructing
  the production transport. Do not echo arbitrary input or program paths.
- Use a narrow runner taking an argument iterator, FnOnce(Pair) returning the
  existing Result<PriceObservation, MarketDataError>, and stdout/stderr writers.
  Inspect at most two arguments, do not collect an unbounded iterator.
- The binary uses args_os, validated default TimeoutConfig (3/10 seconds),
  ReqwestTransport and MarketDataAdapter with a SystemTime clock. Construction,
  one fetch_price call, client destruction all remain synchronous outside async.
  No custom normalization, transport implementation or new dependency.
- Success exits 0 and writes exactly four LF-terminated lines, in this order:
  pair: <canonical pair>
  price: <exact canonical price> USDT
  provider: Binance
  observed_at_unix_seconds_utc: <signed decimal Unix seconds, 9 fractional digits>
- Timestamp epoch is 1970-01-01T00:00:00Z (Unix/POSIX convention, no leap-second
  encoding). Preserve SystemTime nanoseconds without floats or calendar conversion.
  Epoch is 0.000000000; 100 ns before epoch is -0.000000100.
  Nine display digits do not imply nanosecond clock accuracy: Windows SystemTime
  has 100 ns representation granularity; portable fixtures use multiples of 100 ns. This is local receipt
  metadata, never exchange event time, live-availability proof or freshness.
- Argument failure prints only static usage to stderr:
  Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>
  Fetch/construction/domain failure prints error: <existing safe Display message>
  to stderr and exits 3. No retry, default/stale price or success stdout.
- Output/diagnostic write failure exits 4; best-effort static error message only.
  Stdout write failure may leave partial output; never retry a provider request.
  Stderr itself may be unavailable, so reporting cannot be guaranteed.

## Non-goals
No web/runtime/frontend packages, valuation, persistence, background work, fixture
CLI flag, credentials, signing, transactions, live checks, commits or publication.
Tests use injected behavior; ordinary valid CLI invocation is the production path.

## Security and non-functional requirements
Apply [ADR 0001](../adr/0001-market-data-adapter.md),
[ADR 0002](../adr/0002-security-by-design.md) and
[SEC-01 through SEC-12](../security/security-baseline.md).
New boundaries: OS arguments -> Pair, validated Pair -> production construction,
domain result -> terminal/writers. Invalid/hostile arguments must not create a
client, reach network or appear in diagnostics. Allowlist pair/provider labels;
exact Price and integer-only timestamp prevent financial float conversion.
Keep fixed HTTPS endpoint/TLS, bounded reads, validated budgets, single attempt,
safe errors and no credentials/proxy/retry unchanged. No source/dependency/feature/
MSRV/license change to the adapter; existing advisory evidence remains historical.
Blocking output and OS/DNS delays are not hard real-time bounded. OS already owns
argv allocation; runner does not accumulate argument copies or raw error payloads.

## Acceptance criteria and verification plan
Define deterministic tests before implementation, then implement and run all gates.
- CLI1: BTC and ETH fixtures traverse injected adapter/fake transport once, return
  exact canonical output, fixed time, code 0 and empty stderr.
- CLI2: Missing/extra/unsupported/non-Unicode input returns 2, no stdout and zero
  injected fetch invocations. Executable argument failures also exit 2.
- CLI3: Exact tiny and maximum representable prices and normalized prices print
  without rounding; epoch, fractional and pre-epoch timestamps are exact.
- CLI4: Every domain error returns 3 with safe Display text and no stdout; fake
  transport failures traverse the real adapter once with no retry or price fallback.
- CLI5: Broken stdout/stderr yield 4 without panics or refetching.
- CLI6: Mandatory success/error tests use only fake behavior/transport and fixed
  time. Executable subprocess tests use invalid arguments only. No live provider
  call, socket, sleep or real-time assertion is required; OS network isolation is
  separately unverified, not inferred from offline Cargo.

Run cargo fmt --all -- --check; cargo clippy --locked --all-targets --all-features
-- -D warnings; cargo build --locked --all-targets --all-features; cargo test
--locked --all-features. Preserve all existing 60 tests. Check local links, diff
whitespace/scope and unchanged Cargo files/toolchain/CI. Record exact new tests,
gate results and residual limitations; leave closure to human acceptance.

## Dependencies, risks and open decisions
No new dependencies required. Reuse std argument, time, I/O and exit facilities.
Provider/regional availability, live TLS/deadlines and current hosted CI remain
unverified. No CLI implementation decision blocks this authorized scope.
Full-stack implementation and dependency verification require separate approval.

## M1 verification evidence (2026-10-17)
All four exact Cargo gates passed on Windows; 73 tests passed, zero failed/ignored.
The original 60 tests are unchanged; 13 added tests are in tests/cli.rs.
The initial test-only run failed because cli::run did not exist. Initial timestamp
fixtures exposed Windows 100 ns SystemTime granularity and were corrected to
portable fixed increments; runner output preserves the supplied platform precision.
No valid production invocation, live request, scanner rerun, Linux or current
hosted CI verification was performed. Existing adapter safety/acceptance gaps remain.
CLI1-CLI6 have deterministic evidence; human milestone acceptance remains pending.
