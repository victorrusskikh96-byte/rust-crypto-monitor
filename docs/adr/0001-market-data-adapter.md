# ADR 0001 — Market Data Adapter

## Title
Synchronous public REST adapter with exact prices and deterministic test seams.

## Date
2026-10-14.

## Status
ACCEPTED. The Technical Lead explicitly approved these architectural choices in Phase 0.2b. Acceptance records the architecture; it does not authorize implementation, dependency installation, commits, or publication.

## Context
The dependency-free single-binary baseline has an empty main function. The first adapter needs public BTC/USDT and ETH/USDT prices, predictable failures, bounded requests and deterministic tests. There is no approved streaming latency or concurrent ingestion requirement. [Specification 0003](../specs/0003-market-data-adapter.md) defines the detailed contract and acceptance criteria; [architecture](../architecture.md) defines the baseline and ADR conventions.

## Decision
- Use synchronous REST and reqwest blocking, without an application-owned Tokio runtime. Two on-demand symbol fetches need no stream subscription, reconnect/heartbeat handling or application task orchestration. Reqwest may transitively use Tokio internally.
- Use Binance as the sole MVP provider, through its public market-data-only HTTPS host and single-symbol price ticker. Its compact string symbol/price schema maps directly to the required pairs. Provider and regional availability remain operational prerequisites, not approval guarantees; never bypass restrictions or switch providers silently.
- Use serde and serde_json for a typed private provider DTO. Use rust_decimal behind a validated positive Price wrapper, parsing decimal strings exactly without floating-point intermediates, rounding or saturation. Reject out-of-range precision/coefficient values.
- Inject only narrow HttpTransport and Clock seams. Scripted responses/errors and fixed observation time permit offline tests of request mapping, validation, failure classification and timestamps without live exchange calls or sleeps. Clock supplies local observation time, not exchange event time or deadline enforcement.
- Permit exactly one transport attempt for a validated call reaching transport; reject invalid input before I/O. Prohibit application retries and disable library-level protocol retries where supported, verifying selected-release behavior before production transport. Inability to enforce the contract requires review. Packet retransmission is outside the adapter-attempt definition.
- Disable redirects and proxy inheritance; use verified TLS, configured connection/total request timeouts, and bounded streaming reads before decoding. No credentials, trading, wallet operations or blockchain transactions. Preserve deterministic offline tests and the four existing Cargo gates.
- Return rate-limit failures with optional Retry-After metadata without sleeping or retrying. A zero delay never overrides the future caller's rate-limit policy. Retry scheduling and shared-IP budgeting require separately approved requirements.

## Alternatives
- WebSocket: useful for lower latency and continuous updates, but introduces subscription state, reconnects, heartbeats and stream failure semantics without an MVP requirement.
- Async REST with an application Tokio runtime: useful for concurrent workloads, but adds orchestration unnecessary for this contract.
- Kraken: public ticker alternative with provider aliases/envelope handling. Coinbase Exchange: public product ticker alternative requiring confirmation of the required USDT products. Neither is an automatic fallback.
- f64: compact but cannot preserve decimal prices exactly. Scaled integers: avoid a decimal dependency but require a project-specific scale and overflow policy. Arbitrary precision: greater range than this MVP requires.
- Concrete network/time calls in core logic: fewer seams but nondeterministic tests and live-service dependence. A provider SDK or generalized plugin framework adds unnecessary scope.
- Automatic retry/backoff: may improve transient success rates but hides additional requests, complicates bounded failure behavior and may worsen rate limits. Keep one attempt and leave caller policy for a later specification.

## Consequences
The public API is synchronous and blocks the calling thread; do not call reqwest blocking directly inside an async runtime. Exact prices have explicit representational limits. A received observation does not establish last-trade freshness. Timeouts are configured HTTP bounds, not hard real-time guarantees across DNS/OS/library behavior; client construction and decoding are outside that deadline. Bounded reads constrain payload memory but fake tests cannot prove real TLS, DNS or elapsed timeout behavior. A single provider can be unavailable or regionally restricted, and failures are returned without fallback.

The approved direct dependency choices are reqwest, serde, serde_json and rust_decimal. Exact compatible versions/features and the transitive graph must be reviewed at their implementation milestones. No dependencies or additional abstractions are introduced by this ADR.

## Reconsideration triggers
Revisit through a new reviewed ADR if approved requirements demand streaming latency, substantial concurrent fetches, another provider/region, historical or atomic snapshots, greater decimal range, or scheduler-level retry/rate-budget handling. Also revisit if the selected HTTP stack cannot disable protocol retries or meet the required timeout/streaming contract. No trigger grants automatic scope expansion.

## Related specification links
- [Market Data Adapter specification 0003](../specs/0003-market-data-adapter.md).
- [Harness specification 0001](../specs/0001-harness-bootstrap.md).
- [CI specification 0002](../specs/0002-ci-bootstrap.md).
