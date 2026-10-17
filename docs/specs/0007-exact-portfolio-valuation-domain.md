# 0007 — Exact Portfolio Valuation Domain (M2a)

## Status
APPROVED for M2a implementation by the Technical Lead's request on 2026-10-17.
This narrows [approved 0005](0005-freelance-portfolio-mvp.md), especially FR2,
FR5–FR7, AC2–AC4/AC18 and M0.1 financial rules; it changes no approved policy.
Implementation evidence and human milestone acceptance are separate from approval.

## Scope and extracted financial contract
Pure Rust library domain only: two typed quantities, supplied validated observations,
individual USDT valuations, total, allocations and explicit incomplete reasons.
No market-data fetch, I/O, CLI integration, serialization, HTTP/frontend, new
dependency, clock reads, storage, trading or financial side effect.
Quantity: unsigned ASCII digits optionally followed by dot +1–8 digits, <=32 bytes,
0..=1000000 per asset, zero valid, leading zeros accepted, canonical trailing-zero
normalization. Reject signs (including -0), whitespace, exponents, separators,
non-ASCII, empty components and excess scale even if trailing zeros.
Price retains the existing positive exact Price contract, scale <=28/96-bit
coefficient. Money is exact USDT, not USD. No rounded money feeds arithmetic.
Monetary results must normalize to <=96-bit coefficient and scale <=28.
Checked u128 intermediate overflow returns ArithmeticCapacity, including when a
larger representation might eventually fit. Final coefficient/scale failure returns
UnrepresentableValue. These are distinct typed safe errors.
Allocation alone rounds independently half-even to two percentage decimals.
Zero total has no allocation; a zero holding contributes exact zero without a quote.
Positive missing/stale quotes produce incomplete holdings, null total and all
allocations absent; still compute usable holdings and surface arithmetic failures.

## Minimal public API plan
Private validated Quantity, UsdtValue and AllocationPercent wrappers with canonical
Display (money/quantity ignore formatter precision; allocation always two decimals).
Portfolio has explicit BTC/ETH quantity slots; Quote wraps existing PriceObservation
plus caller-supplied monotonic observation age and latest-attempt success.
No wall timestamp decides freshness. Fresh is age <=60 seconds and latest attempt
successful; failed latest attempt immediately makes retained observation stale.
The future application must supply honest monotonic ages and metadata; M2a cannot
prove external freshness, provider availability or fixture provenance.
Validate expected quote pair even for zero holdings; return InvalidQuote for
swapped/duplicate pair slots. Price's existing constructor prevents invalid values.
Results expose read-only holdings, original quote metadata, optional exact values,
incomplete reason QuoteMissing/QuoteStale, optional allocations/total and
Complete/Incomplete state derived from total presence.
No mutable Decimal escapes or generic money engine. Future handlers can serialize
Display text; no serde implementation or snapshot/runtime state machine now.

## Precision review and algorithm
Reviewed installed rust_decimal 1.43.0 sources: arithmetic_impls.rs routes checked
operations to the same calculation routines; ops/mul.rs reduces scale/rounds
including successful zero on tiny products, ops/add.rs can lose low digits during
alignment/rescaling, ops/div.rs rounds a remaining remainder at capacity.
Therefore Some from checked_mul/add/div is not an exactness proof.
The [versioned Decimal reference](https://docs.rs/rust_decimal/1.43.0/rust_decimal/struct.Decimal.html)
documents the 96-bit coefficient and scale 0–28 representation.
[Multiplication source](https://docs.rs/rust_decimal/1.43.0/src/rust_decimal/ops/mul.rs.html)
and [division source](https://docs.rs/rust_decimal/1.43.0/src/rust_decimal/ops/div.rs.html)
support this review; source findings are separate from the tests below.

Use Decimal only for exact parsing, normalization, coefficient/scale access and
checked-representation construction/display, never for monetary multiplication,
sum or division. Read Price through its existing exact canonical string and
from_str_exact rather than changing the market-data core or exposing its internals.
Normalize coefficients first, multiply with checked u128, combine scales, remove
only exact trailing zeros and verify final coefficient/scale before constructing
money. Sum uses checked alignment and addition with the same final checks.
Zero bypasses unnecessary scaling. Loops are bounded by input/representation limits.
Allocation aligns exact value/total coefficients, performs four integer long-division
digits for hundredths of percent, then half-even rounds from the remaining exact
remainder. Compare remainder to divisor-minus-remainder to avoid doubled-remainder
overflow. Any required checked intermediate overflow is ArithmeticCapacity.
No double rounding, binary floating point or arbitrary-precision dependency.

## Deterministic acceptance plan
Establish failing tests before behavior. Verify the reported 73-test baseline first.
Use pure supplied prices/ages, no sockets, sleeps, SystemTime::now or live services.
Cover:
- Quantity grammar/32-byte/8-digit/1000000 boundaries, zero normalization and safety.
- BTC-only, ETH-only, mixed golden 11500.01200002 USDT, all-zero, tiny/max quantities.
- Missing BTC/ETH/both, stale BTC/ETH/both, failure-after-success, exactly 60 seconds,
  one nanosecond beyond TTL, irrelevant wall timestamp and zero stale/missing quotes.
- Pair mismatch validation, safe errors and arithmetic errors not hidden by missing data.
- Product coefficient/combined-scale overflow, exact trailing-zero rescue,
  checked u128 product/alignment overflow, total overflow and no hidden display rounding.
- Allocation 0/100, thirds, complementary half-even ties (0.005->0.00,
  0.015->0.02 percent), extreme prices without unchecked value*10000,
  and deterministic integer reference sweeps for money/total/percentage consistency.
- Demonstrate rust_decimal checked operations can succeed with rounded results
  whereas domain exact monetary arithmetic returns a typed failure.

## Security, verification and limitations
Apply [security baseline SEC-01–SEC-12](../security/security-baseline.md) and
[ADR 0002](../adr/0002-security-by-design.md). New boundaries are untrusted quantity
text and supplied quote pair/freshness metadata into pure arithmetic. Reject before
arithmetic, no retained input in errors, bound parsing/loops/allocations to two assets,
check all financial intermediate ranges and never fetch/default missing prices.
Private wrappers prevent invalid mutable money; no unsafe code or dependency/feature
changes. Existing supply-chain/advisory results remain historical, not rerun.
Preserve transport, CLI, fixtures, prior tests, index and all unpublished work.
Run all four required Cargo gates, document/status/link/whitespace/scope checks and
new deterministic tests; no live provider calls, commit, push or deployment.
Full-stack 0005 remains APPROVED, not IMPLEMENTED. M2b requires separate HTTP scope,
dependency compatibility/security review and implementation authorization.

## M2a verification evidence (2026-10-17)
- Baseline before expansion: all four required Cargo gates passed, 73 tests passed.
- TDD: new tests first failed with unresolved portfolio module; implementation then
  passed 30 tests, extended by two precision regressions (32 portfolio tests total).
- Final exact gates passed: cargo fmt --all -- --check; cargo clippy --locked
  --all-targets --all-features -- -D warnings; cargo build --locked --all-targets
  --all-features; cargo test --locked --all-features.
- Final result: 105 passed (73 unchanged +32 new), zero failed/ignored. An initial
  Clippy style finding was fixed with is_multiple_of; no suppression was added.
- Tests demonstrate checked Decimal underflow/coefficient/addition rounding,
  representability rejection, exact trailing-zero rescue, half-even ties and
  adjacent values, and a conservative capacity error despite mathematical fit.
- Preservation hashes verify no changes to the market core, CLI, prior tests,
  fixtures, dependencies, toolchain, CI, ADRs or approved 0005 financial contract.
  M2a changes only its module/tests/export, README/context, this specification and
  the M1 CLI specification's newly human-accepted status. Index remains unchanged.
- Document links/status/whitespace/scope and pure-source checks passed.
  No M2a network/provider requests, scanner rerun, Linux or hosted CI verification.
- Source review: two fixed holdings, <=32-byte parser, <=36-step normalization,
  <=28-scale alignment and four-digit integer division; no float/unsafe/I/O or
  mutable financial internals. Caller quote age/status remains a trust assumption.
  Future handlers must use server-held observations/monotonic ages, not user prices.
- No new dependency/advisory scan; historical scanner evidence is not renewed.
  No HTTP/JSON/CLI portfolio integration or full-stack completion is claimed.
  Human acceptance of M2a remains pending; 0007 stays APPROVED, not IMPLEMENTED.
