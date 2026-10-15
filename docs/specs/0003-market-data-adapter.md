# 0003 — Market Data Adapter

## Status
APPROVED. The Technical Lead approved the overall architecture in Phase 0.2b on 2026-10-14, with the clarifications recorded below. [ADR 0001](../adr/0001-market-data-adapter.md) records the accepted architectural choices. This approval does not authorize implementation, dependency installation, commits, or pushes. IMPLEMENTED requires verified acceptance criteria and human acceptance of closure.

## Problem
The existing binary has an empty entry point and cannot acquire or normalize prices. A small read-only boundary is needed before monitoring rules can consume trustworthy, consistently represented BTC/USDT and ETH/USDT observations.

## Goals
- Fetch one latest-price observation for either supported pair through a public API.
- Preserve exact decimal prices, validate inputs and responses, and return predictable errors.
- Bound network operations and response size; verify behavior without external network access.
- Keep provider details separate from the domain and defer continuous monitoring.

## Non-goals
No implementation in documentation phases 0.2a–0.2b. No WebSocket streams, scheduler, CLI integration, alerts, persistence, historical data, order books, batch snapshots, provider failover, automatic retries, or trading simulation. No authenticated APIs, credentials, orders, signing, wallet access, blockchain transactions, or mainnet operations. No dependency installation, changes to application/package files, commits, pushes, publication, or deployment in this phase.

## Functional requirements
This section defines the approved contract; exact dependency versions/features and each implementation milestone still require authorization.

- FR1 — Pair input: expose a typed Pair with BtcUsdt and EthUsdt variants. Its string parser accepts exactly BTC/USDT and ETH/USDT, case sensitively, without trimming or aliases. Reject empty, whitespace, lowercase, USD, unsupported assets, and injection-like strings as UnsupportedPair before transport execution. Map approved variants internally to BTCUSDT and ETHUSDT; never interpolate arbitrary user input into a URL.
- FR2 — Fetch contract: use a synchronous fetch_price(Pair) returning Result<PriceObservation, MarketDataError>. A call rejected before transport makes zero attempts; each valid call reaching transport makes exactly one transport attempt, even when it fails before an HTTP request reaches the server. The sole permitted request is one GET to https://data-api.binance.vision/api/v3/ticker/price with exactly one symbol query parameter. No credentials, API key headers, body, or trading endpoints. Use one reusable HTTP client. No hidden transport retries or redirects. Disable library-level protocol retries where supported, including retries for protocol NACKs/recoverable connection failures; verify the selected release and enabled protocol stack. If the stack cannot meet the one-attempt contract, surface the incompatibility for review rather than silently weakening it. TCP packet retransmission and connection establishment are not additional adapter attempts. A failed call never returns a cached, default, zero, or partially decoded observation.
- FR3 — Normalized output: PriceObservation contains canonical pair, a validated exact Price, provider identity Binance, and received_at as std::time::SystemTime supplied by an injectable clock after successful decoding. Price means the provider's latest symbol price in USDT per unit of base asset; USDT is not USD. This endpoint supplies no exchange event timestamp: do not invent one or assert price freshness. Separate fetches are not an atomic snapshot. Local clock time is observation metadata, not monotonic time or evidence of last-trade age. It can move backward or be skewed; never use it to enforce deadlines. No exchange event time is available from this response.
- FR4 — Response validation: accept only HTTP 200 with a single JSON object containing string symbol and string price. Require symbol to exactly match the requested provider symbol. Reject missing, null, duplicate known fields, wrong types, arrays, malformed/trailing JSON, invalid UTF-8, and symbol mismatches. Ignore unknown fields for forward compatibility. Never decode an error body as a successful price.
- FR5 — Price: use a private wrapper around rust_decimal::Decimal. Accept only unsigned ASCII digits followed optionally by a dot and one or more ASCII digits; no whitespace, signs, exponent notation, separators, NaN, or infinity. Bound the input price string to 128 bytes before parsing. Parse with Decimal::from_str_exact, reject unrepresentable coefficient/scale and values <= 0, never round, and never pass through f32/f64, including intermediate JSON numeric conversions. Validate grammar and fractional-digit limits before exact decimal parsing. Permit at most 28 fractional digits; the decimal coefficient must fit the library's 96-bit representation. Normalize trailing fractional zeros for canonical display, using plain decimal notation. Values such as 00012.3400 may normalize to 12.34; 0.00000001 remains exact. No exchange tick-size rounding or currency conversion.
- FR6 — Configuration: constructor accepts typed connect_timeout and request_timeout Durations. Defaults are 3 seconds and 10 seconds. Require 0 < connect_timeout <= request_timeout <= 60 seconds; reject invalid configuration before I/O. Configure the total request timeout to cover connection and response-body reading, including slow bodies. Treat this as a configured HTTP deadline, not a hard real-time wall-clock guarantee: DNS/resolver behavior, OS scheduling and library/platform details can affect observed elapsed time. Client construction, decoding, and caller work are outside the HTTP deadline; bounded bytes constrain decoding input. Verify selected-library semantics and preserve timeout classification for both connection and body-read failures. Do not reset the total request budget for each read. Do not expose an arbitrary production base URL. Cap response bodies at 16,384 bytes, reading at most cap + 1 bytes before rejecting oversized input, regardless of Content-Length. Apply the bound while streaming from the response using a limited reader before buffering or JSON parsing; never call an unbounded body-to-bytes/text/JSON helper first. EOF at the cap is permitted; the extra byte detects oversize. Disable automatic decompression to avoid hidden expansion.
- FR7 — Error contract: a typed, non-panicking error enum distinguishes UnsupportedPair, InvalidConfiguration, ClientInitialization, Timeout, Transport, RateLimited, ProviderUnavailable, HttpStatus, ResponseTooLarge, InvalidResponse, SymbolMismatch, and InvalidPrice. Classify transport timeouts before generic Transport. HTTP 429 and 418 map to RateLimited (retain status); 500–599 to ProviderUnavailable (retain status); all remaining non-200 statuses, including redirects and regional/access restrictions, to HttpStatus. On HTTP 200, body-size failure precedes decoding, schema failure precedes symbol validation, and symbol mismatch precedes price validation. On non-200 responses classify status without requiring or reading a body. Transport failures during a successful body read remain Timeout or Transport. Do not expose raw bodies or unrestricted upstream error text in Display output.
- FR8 — Rate limits/retries: exactly one transport attempt per validated call reaching transport, including timeout, 429, 418, and 5xx; validation failures make zero attempts. Disable application and library-level retries as specified in FR2. For 429/418, parse Retry-After only as nonnegative ASCII integer seconds fitting u64; expose Option<Duration>, with absent, date-form, invalid, and overflowing values represented as None. Do not sleep or retry inside the adapter. A future polling caller must stop or respect provider cooldown before issuing another request; None never means immediate retry permission. Retry-After: 0 is valid metadata but does not override caller-level rate-limit policy or authorize an immediate retry; the adapter still returns RateLimited and makes no second attempt. No scheduler is delivered here, and no hard-coded global rate budget is claimed sufficient for shared-IP limits.
- FR9 — Test seams: inject a narrow synchronous HttpTransport and a Clock. Transport accepts only an internally constructed request and validated timeout settings; returns status, relevant headers, and bounded bytes or a typed failure. Production transport enforces streaming size and time limits. A fake captures calls and returns scripted fixtures or failures with no sockets or real sleep. Use std::time for durations; no date/time dependency is required.

## Non-functional requirements
- NFR1: Retain one binary package/process, Rust edition 2024, pinned Rust 1.99.0, and existing CI. No application-owned async runtime or task orchestration. Reqwest blocking may use an internal runtime and transitively include Tokio; this is not a dependency-free transport and must not be invoked inside an async runtime.
- NFR2: Mandatory tests use synthetic version-controlled fixtures, a fixed clock, and fake transport. No live services, credentials, wall-clock assertions, or external network are prerequisites. Unit tests do not prove real DNS/TLS/deadline behavior; report that limitation.
- NFR3: HTTPS with certificate and hostname verification enabled, fixed host/path/method, redirects disabled, no cookies, no credential loading, no environment proxy inheritance, and bounded response reads. No secrets or complete upstream payloads in logs/errors. No automatic region bypass or provider switching.
- NFR4: No panic on malformed external input; no silent truncation, saturation, rounding, stale-value fallback, or busy-loop retry. This MVP guarantees bounded requests and input handling, not market-data availability or financial suitability.

## Acceptance criteria
| ID | Requirement | Observable result |
| --- | --- | --- |
| AC1 | FR1, FR2 | Both canonical pair strings parse and produce the exact GET host/path/symbol mapping. Invalid strings return UnsupportedPair with zero fake transport calls. |
| AC2 | FR3–FR5 | BTC fixture {"symbol":"BTCUSDT","price":"65000.12000000"} produces BTC/USDT, exact 65000.12, Binance identity, and fixed injected received_at. ETH fixture {"symbol":"ETHUSDT","price":"2500.00000001"} preserves every digit. |
| AC3 | FR4 | Missing/null/duplicate fields, wrong types, array, malformed/trailing JSON, and invalid UTF-8 return InvalidResponse; mismatched symbol returns SymbolMismatch; unknown fields are accepted. No observation escapes on failure. |
| AC4 | FR5 | Test zero, negative, empty, whitespace, signed, exponent, NaN, infinity, non-ASCII, overlength, 29 fractional digits, and coefficient overflow: all return InvalidPrice. Test smallest supported fraction 0.0000000000000000000000000001, 96-bit coefficient maximum, leading zeros, and trailing-zero normalization exactly. Numeric JSON prices return InvalidResponse. |
| AC5 | FR6 | Defaults and valid boundary timeout settings reach the fake unchanged. Zero, reversed, or >60-second settings fail before transport use. Exactly 16,384 response bytes proceed to decoding; 16,385 fail ResponseTooLarge. Production bounded-reader tests cover missing/dishonest Content-Length and slow-read timeout mapping without allocating an unbounded body. |
| AC6 | FR7 | Scripted connection/read timeouts, transport failures, client initialization failure, 301, 400, 403, 451, 418, 429, 500, and 503 map to the documented variants/statuses. Non-200 malformed bodies cannot mask status. Error text contains no payload or credential values. |
| AC7 | FR8 | Every failure causes at most one captured request and no sleeper call. Retry-After values 0 and 120 parse; missing, negative, date, malformed, and overflowing values yield None while retaining RateLimited/status. |
| AC8 | FR9, NFR2 | All required tests run with external network disabled and fixed clock; results are independent of real exchange availability and time. |
| AC9 | NFR1, NFR3 | Review production client settings for HTTPS verification, fixed destination, disabled redirects/retries/proxies/decompression/cookies and configured deadlines. No auth/trading endpoints, secret inputs, background polling, or new runtime entry point exist. |
| AC10 | All | Four required gates pass, fixtures and documentation match behavior, architectural records are accepted before dependent code, and the human accepts closure. |

## Verification plan
Follow Spec → Plan → Test → Implement → Verify → Review → Approval. This draft defines acceptance tests; it does not claim their implementation or execution.

For documentation phases 0.2a–0.2b, check template sections, current approval status, requirement/criterion traceability, Markdown links, safety boundaries, whitespace, and Git scope. Inspect the new untracked file explicitly because ordinary git diff omits its content. Phase 0.2a created only this specification. Phase 0.2b also authorizes one accepted ADR and reconciliation of README, architecture, and foundation specifications; application, dependencies, toolchain, and CI remain unchanged. Run the four repository-mandated Cargo gates for the unchanged baseline; zero tests do not validate adapter behavior.

After approval, define failing deterministic tests before each behavioral milestone. Place synthetic fixtures under tests/fixtures/market_data/ with source-schema reference and no secrets. Cover the acceptance table with table-driven unit tests and captured-request assertions. Exercise production bounded reading through std::io::Read fakes (including timed-out I/O errors), not just already-buffered fake responses. Review the client builder configuration because simulated Timeout does not prove reqwest enforces elapsed deadlines. Mandatory tests require no sockets; optional separately authorized loopback/manual HTTPS checks are supplementary and never a release prerequisite. Do not substitute real exchange calls for fixture tests.

Run from the repository root after implementation and for this baseline verification:

```powershell
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo build --locked --all-targets --all-features
cargo test --locked --all-features
```

Expect zero failures and no warnings; dependency resolution/lockfile updates occur only in an approved implementation phase. Check git diff --check and git status --short --branch. Record executed commands, actual results, skipped checks, platform limitations, and human review. No feature may be marked IMPLEMENTED from documentation checks or empty baseline tests alone.

## Dependencies and risks
### Recovered baseline and foundation reconciliation
Inspection on 2026-10-14 found an empty src/main.rs, one package rust-crypto-monitor 0.1.0, edition 2024, toolchain 1.99.0, no dependencies, and a local-package-only lockfile. Main tracks origin/main at 19b7cf17302f7ee3ad9b3c2377483e446a96b92c. No nested instructions or prior ADRs were found before Phase 0.2b.

Foundation phases 0.1a–0.1d were previously accepted by the human. GitHub API inspection confirmed [hosted run 38555819823](https://github.com/victorrusskikh96-byte/rust-crypto-monitor/actions/runs/38555819823) completed successfully for that commit, with Formatting, Clippy, Build, and Tests all successful. Specifications 0001 and 0002 are now IMPLEMENTED; their historical phase requirements and evidence are preserved. No separate 0.1d specification exists. The empty binary has zero behavioral tests; hosted gate success is not adapter coverage.

### Accepted architecture and deferred alternatives
| Topic | MVP decision and rationale | Deferred alternatives |
| --- | --- | --- |
| Transport | REST single-symbol fetch: simple bounded request/response contract for two pairs. | WebSocket adds reconnect, heartbeat, subscription and stream lifecycle; reconsider when latency requirements justify it. |
| Runtime | Synchronous adapter; no direct Tokio dependency. | Async reqwest/Tokio if concurrent workloads or streaming are approved. |
| Provider | Binance public market-data-only host, fixed ticker endpoint: compact symbol/price schema and direct pair mapping. | Kraken public ticker requires provider aliases/result-envelope handling; Coinbase Exchange product ticker is another option, subject to verifying required USDT product availability. No provider SDK or failover now. |
| JSON | serde derive plus serde_json, private provider DTO with string fields; no hand-written JSON parser. | Streaming JSON or generalized provider schema framework unnecessary for bounded tiny payloads. |
| Precision | rust_decimal with exact parsing and a positive Price wrapper. | f64 loses decimal exactness; scaled integers force a project-specific scale/overflow policy; arbitrary precision adds unnecessary scope. |
| Resilience | Explicit errors, request limits, no automatic retries; expose cooldown metadata. | Scheduler-level capped exponential backoff, jitter, circuit breaker and shared-IP rate budgeting need separate requirements. |
| Boundaries | Planned src/market_data/mod.rs orchestrates fetch; types.rs owns Pair/Price/observation/config/errors; binance.rs owns mapping/DTO normalization; transport.rs owns HTTP/client and a narrow fake seam. Keep clock abstraction private and minimal. | No crates/workspaces, general plugin framework or speculative monitoring modules. |

### Approved dependency choices (not installed)
- reqwest: blocking HTTP client and verified TLS. Disable default features; enable blocking and the selected release's rustls feature. Explicitly disable built-in retries, redirects and automatic proxies. Provides maintained HTTPS/deadline behavior instead of implementing HTTP/TLS. It introduces transitive runtime/HTTP/TLS dependencies even with a synchronous public API.
- serde with derive: small typed response DTO; rejects missing/duplicate known fields and wrong field types.
- serde_json: parse bounded JSON bytes; no reqwest JSON feature needed.
- rust_decimal with minimal suitable std features: exact bounded decimal storage and from_str_exact, without Serde integration or floating-point conversion.
- No thiserror, chrono, async-trait, provider SDK, mocking framework, or additional test dependency; use std error/display/time and local fakes.

At the approved dependency milestone, select exact compatible stable versions/features, verify Rust 1.99.0 support on Windows and hosted Ubuntu, review licenses/security and the transitive graph, then commit a lockfile only when separately authorized. The crate choices are approved, but exact versions/features and additions to Cargo files require the next scoped authorization. Provider reachability, regional restrictions, current pair listing, and operational quota are not verified by reading API docs. Availability varies by region and provider policy; no reachability, listing, or uptime guarantee follows from architecture approval. Unavailable access must return an error, never trigger a bypass, alternate domain, proxy, or silent provider switch. Unknown exchange freshness and representational price limits are explicit limitations.

### Independently verifiable implementation milestones
1. Architecture approval (recorded in Phase 0.2b): specification APPROVED and ADR 0001 ACCEPTED; documentation reconciled. No adapter code. Subsequent milestones still need individual authorization.
2. Domain contract: approve exact dependency selection for decimal support; write failing pair/price/config tests, then implement domain types/errors. Verify AC1 input cases and AC4 plus all four gates. No HTTP behavior.
3. Provider normalization: add approved serde/serde_json dependencies; define fixtures/tests before DTO parser and normalization. Verify AC2–AC4, error precedence, fixed clock, and all gates. No external I/O.
4. Fetch orchestration: define fake transport/clock tests, then implement one-call fetch and status/cooldown/error mapping. Verify AC1/AC5–AC8 through fakes and all gates; no live service.
5. Production transport: approve reqwest version/features/lockfile update; define bounded-reader/error tests, implement fixed-host client and configuration. Verify AC5/AC6/AC9, inspect actual dependency features, run all gates. Leave main empty; no polling or CLI behavior.
6. Integration review: run complete offline fixture suite and four gates; review all acceptance evidence, security boundary and updated documentation. Report untested real TLS/availability/timing limitations and request human acceptance. CLI integration is a later separately specified task.

Each milestone ends in review; do not automatically cross the next approval boundary. Tests precede behavior. No milestone authorizes commits or pushes.

### Primary references
Official documentation inspected on 2026-10-14; no exchange API request was made:
- [Binance public market-data host and rate-limit behavior](https://developers.binance.com/en/docs/products/spot/rest-api).
- [Binance symbol price ticker schema](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market).
- [Kraken ticker API](https://docs.kraken.com/api-reference/market-data/get-ticker-information).
- [Coinbase Exchange product ticker](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker).
- [Reqwest blocking/runtime behavior](https://docs.rs/reqwest/latest/reqwest/blocking/index.html) and [client configuration](https://docs.rs/reqwest/latest/reqwest/blocking/struct.ClientBuilder.html).
- [Serde derive](https://serde.rs/derive.html), [serde_json](https://docs.rs/serde_json/latest/serde_json/), and [Decimal exact parsing and bounds](https://docs.rs/rust_decimal/latest/rust_decimal/struct.Decimal.html).
- Repository conventions: [architecture](../architecture.md), [harness specification](0001-harness-bootstrap.md), [CI specification](0002-ci-bootstrap.md), [template](TEMPLATE.md).

## Open decisions
The Technical Lead has approved the MVP architecture and this clarified contract; no architectural choice listed in ADR 0001 remains pending.
- Human authorizes the next domain implementation milestone separately. Blocks code changes; this documentation task supplies no implementation authorization.
- Select and approve exact compatible crate versions/features and review transitive dependencies at the relevant implementation milestones. Verify reqwest retry controls and timeout semantics on the chosen release/platform; inability to enforce the one-attempt contract requires review. Blocks dependency changes, not documentation closure.
- Before operational use, verify public provider access and required pair availability in the intended region without credentials or restriction bypass. Blocks operational use, not deterministic domain tests.
- Human reviews and accepts Phase 0.2b documentation closure after verification. Foundation acceptance is already recorded separately.

## Phase 0.2c — Domain milestone evidence (2026-10-14)
The human accepted Phase 0.2b and explicitly authorized this domain milestone, including dependency selection and lockfile changes. This supersedes the earlier documentation-only execution restriction for this scope alone. Overall specification status remains APPROVED; full adapter acceptance and domain milestone closure remain subject to review.

### Dependency review
Pinned rust_decimal =1.43.0 with default-features=false and only std enabled. Published/local manifest declares Rust 1.67.1 and MIT licensing; the project uses 1.99.0. The selected implementation is pure Rust, without native linking requirements beyond the existing toolchain. Active normal dependencies are arrayvec 0.7.8 (Rust 1.51, MIT OR Apache-2.0) and num-traits 0.2.19 (Rust 1.60, MIT OR Apache-2.0); num-traits builds with autocfg 1.5.1 (Rust 1.0, Apache-2.0 OR MIT). No Serde, JSON, HTTP or async features are enabled. Cargo.lock also resolves optional upstream packages; their presence is not evidence that their features are active. Do not manually prune Cargo's lockfile. The local feature tree verifies the active graph.

The exact parser is wrapped by ASCII syntax, byte-length, scale, positive-value and 96-bit input-coefficient validation. This rejects an overflowing input coefficient even if removing trailing fractional zeros could make the numeric value representable. Decimal::from_str_exact and normalize preserve exact value without floating-point intermediates. Windows MSVC compilation is verified locally. Ubuntu compatibility is supported by the portable source/manifests, but the changed code has not run on hosted Ubuntu; the previous hosted run only verifies the foundation.

### Scope and TDD evidence
Added src/lib.rs, src/market_data/mod.rs, src/market_data/types.rs and tests/domain.rs within the existing package. The library target exposes the domain API to integration tests; no second package, runtime or application integration is introduced. main.rs, CI, ADR 0001 and foundation specifications are unchanged from the accepted Phase 0.2b working tree. README and architecture current-state descriptions are updated without changing accepted decisions.

Thirteen deterministic table-driven tests were written before the domain types. The first test-file write encountered Windows encoding failure and was corrected before the red test run. cargo test --locked --offline --test domain then failed compilation with E0432 for the absent Pair, Price, TimeoutConfig and MarketDataError types. This is compile-red evidence, not 13 failing assertions and not separate per-type runtime red cycles. After implementation the same command passed all 13 tests. Tests use no sockets, clocks, sleep, credentials or live data. Domain errors are only UnsupportedPair, InvalidPrice and InvalidConfiguration, with static Display messages and no retained inputs.

### Acceptance coverage and deferred work
- Domain portions of AC1: exact pair parsing, identity and canonical display; provider symbols/GET mapping and zero fake calls are deferred.
- Domain portions of AC4: exact normalized decimal display, positive values, byte length, strict syntax, scale and coefficient boundaries. Numeric JSON type validation is deferred.
- Domain portions of AC5: defaults, valid positive/subsecond/equal/maximum durations, zero/reversed/over-limit rejection. Transport propagation, deadlines and body bounds are deferred.
- Domain portions of AC6/AC8/AC9: input-free domain error messages, deterministic network-free tests, no float conversions, no runtime/network/trading behavior. Full transport/clock/security checks are deferred.
- AC2, AC3, AC7 and remaining provider/transport portions of all criteria await later milestones. AC10 requires eventual full criteria coverage and human acceptance; passing domain gates does not implement the overall specification.

An offline full cargo metadata attempt and Linux-target cargo tree attempt could not complete because Cargo attempted to load uncached optional/target packages (bumpalo/libc). These are inspection limitations, not domain test failures. cargo metadata --locked --offline --no-deps and the local cargo tree --locked --offline -e features succeeded. No Ubuntu execution is claimed. Exact mandatory gate results and final review are reported to the human; no commits/pushes or live exchange calls are authorized by this milestone.

## Phase 0.2d — Offline provider normalization evidence (2026-10-14)
The human conditionally accepted Phase 0.2c and explicitly authorized this normalization milestone. The domain review found no critical mismatch: strict Pair syntax, private exact Price invariants, input coefficient/scale boundaries, validated timeout budgets and static domain errors are implemented and covered by the existing 13 tests. Their source remains unchanged. Prior work was staged at recovery; the index is preserved and this milestone is left unstaged. Overall specification status remains APPROVED, not IMPLEMENTED; no HTTP or fetch orchestration is delivered.

### Dependencies and compatibility
Added exact serde =1.0.229 with default features disabled and std/derive enabled, and serde_json =1.0.154 with default features disabled and only std enabled. Serde requires Rust 1.56; serde_derive and serde_json require 1.71. These are stable releases, MIT OR Apache-2.0, below the pinned Rust 1.99.0 requirement. Rust_decimal's Serde feature remains disabled and its version/features are unchanged.

Reviewed active transitive dependencies: serde_core 1.0.229, serde_derive 1.0.229, proc-macro2 1.0.107, quote 1.0.47, syn 3.0.9, unicode-ident 1.0.27, itoa 1.0.18, memchr 2.8.3 and zmij 1.0.23. Their declared Rust requirements are <=1.71. Licenses are MIT/Apache alternatives, except zmij (MIT), memchr (Unlicense OR MIT), and unicode-ident ((MIT OR Apache-2.0) AND Unicode-3.0). The selected graph has no HTTP client/runtime or platform-specific native library requirement. Windows MSVC is verified locally; Ubuntu portability is supported by source/manifests but this changed code has not executed on hosted Ubuntu. Cargo.lock records existing package versions plus the new root edges and Serde derive edge; no unrelated crate version was changed.

References: [Serde manifest](https://raw.githubusercontent.com/serde-rs/serde/v1.0.229/serde/Cargo.toml), [serde_json manifest](https://raw.githubusercontent.com/serde-rs/json/v1.0.154/Cargo.toml), [derive](https://serde.rs/derive.html), [JSON from_slice](https://docs.rs/serde_json/1.0.154/serde_json/fn.from_slice.html). Local resolved manifests and cargo tree --locked --offline -e features verify the selected graph, not merely the declared options.

### Behavior and TDD evidence
Added a private derived TickerResponse with required String symbol/price fields. normalize_ticker receives an already selected typed Pair, response bytes and a narrow Clock; it performs no I/O. It checks the 16,384-byte slice cap, whole-body UTF-8, object shape, typed JSON schema with complete consumption, exact provider symbol, and domain Price in that order. It returns canonical Pair, exact Price, Provider::Binance, and a single clock sample only after successful validation. received_at is local SystemTime metadata, including times before UNIX_EPOCH; it is not an exchange event timestamp or freshness guarantee.

There is no Value/map intermediate, so derive rejects duplicate known fields, including equivalent escaped keys. The object guard also rejects positional arrays that derived struct visitors otherwise accept. Unknown fields are ignored; invalid UTF-8 is rejected even inside ignored fields. Parser diagnostics and raw payloads are discarded; new static errors are InvalidResponse, SymbolMismatch and ResponseTooLarge. The byte-slice cap is defense in depth, not implementation of streaming body limits: the later fetch/transport layers must classify HTTP status before parsing and enforce the cap during reads.

Fifteen tests and synthetic BTC/ETH fixtures were written first. The first offline command stopped because serde_derive was uncached; it is not red-test evidence. After downloading that selected dependency, cargo test --test normalization failed with E0432 for absent normalization/observation APIs. After API scaffolding and an always-InvalidResponse stub, cargo test --locked --offline --test normalization executed 15 tests: 9 failed, 6 passed. This is the runtime red phase. After implementing the normalizer and formatting, cargo test --locked --offline --test normalization --test domain passed 15 normalization and all 13 unchanged domain tests (28 total). No ignored tests, sockets, real clocks, live exchange calls or credentials are required.

### Requirements-to-tests traceability
Tests are in [normalization.rs](../../tests/normalization.rs), with existing domain assertions in [domain.rs](../../tests/domain.rs). Synthetic fixture provenance is recorded in the [fixture README](../../tests/fixtures/market_data/README.md).

| Requirements / criteria | Test names / verified behavior |
| --- | --- |
| FR3–FR5 / AC2 | btc_fixture_normalizes_identity_price_and_time; eth_fixture_normalizes_identity_price_and_time: pair, exact price, Binance identity, fixed timestamp and one clock call. |
| FR5 / AC4 | exact_decimal_boundaries_survive_json_normalization; invalid_and_unrepresentable_price_strings_are_rejected: exact coefficient/scale boundaries, syntax, zero, out-of-range values, Unicode and overlength prices. Existing domain tests retain all original price validation assertions. |
| FR4 / AC3 | missing_required_fields_are_invalid; null_and_incorrect_field_types_are_invalid: required strings, including rejection of numeric prices (AC4). |
| FR4 / AC3 | duplicate_known_fields_are_rejected_even_when_identical_or_escaped: repeated symbol/price and escaped equivalent key rejection. |
| FR4 / AC3 | top_level_arrays_and_scalars_are_rejected; malformed_and_trailing_json_are_rejected: object-only schema and full JSON consumption. |
| FR4 / AC3 | invalid_utf8_is_rejected_in_known_and_ignored_fields: whole-body validation. |
| FR1, FR4, FR7 / AC1 partial, AC3 | mismatched_symbols_are_rejected_before_price_validation: both pair directions and schema-before-symbol-before-price precedence. HTTP request mapping remains deferred. |
| FR4 / AC3 | additional_unknown_fields_and_trailing_whitespace_are_accepted: forward-compatible unknown/nested fields; no unknown-field uniqueness requirement. |
| FR3, FR9 / AC2, AC8 partial | clock_value_is_local_metadata_and_may_precede_epoch; success helpers and rejection helpers assert one clock call on success and zero on failure. |
| FR6–FR7 / AC5 partial | body_cap_precedes_decoding_and_allows_exact_boundary: exactly 16,384 bytes accepted for decoding, 16,385 rejected before schema/UTF-8 validation. No streaming-reader claim. |
| FR7 / AC6 partial | normalization_errors_retain_no_raw_response: static Display/Debug, no error source retaining input. |
| NFR1–NFR4 / AC8–AC9 partial | All 28 tests are deterministic and network-free; source/dependency review checks no float conversions, logs, unsafe code, runtime or network additions. Production client security remains deferred. |

### Verification scope and next milestone
All four exact repository gates passed locally: cargo fmt --all -- --check; cargo clippy --locked --all-targets --all-features -- -D warnings; cargo build --locked --all-targets --all-features; cargo test --locked --all-features. The final test gate passed 28 tests (13 domain, 15 normalization); library/binary unit and doc-test targets contained zero additional tests. The offline green command above establishes regression coverage without external dependency downloads. No CI, main entry point, domain parsing semantics, financial safety boundaries or accepted ADR are changed. Requirements and acceptance criteria above remain intact; this is an implementation-evidence addendum.

HTTP status classification, transport configuration, request construction, single-attempt fetch orchestration, cooldown parsing and streaming response reads remain unimplemented (FR2, FR6–FR9 and remaining portions of AC1/AC5–AC10). AC2–AC4 normalization behavior is covered; overall milestone closure still requires human review. Recommend Phase 0.2e with fake HttpTransport tests and no production network integration, subject to separate authorization. No commits, pushes or deployments were performed.

## Phase 0.2e — Fetch orchestration evidence (2026-10-15)
The Technical Lead accepted Phase 0.2d and the human authorized single-attempt fetch orchestration with fake transport only. Preflight reviewed instructions, the accepted ADR, current code and all 28 existing tests, plus staged/unstaged changes. No critical conflict was found. The existing staged index and prior files were captured by hash before changes. This addendum does not alter approved requirements, safety boundaries or overall APPROVED status. Full adapter implementation and milestone closure still require verification and human acceptance.

### Contract and implementation
MarketDataAdapter borrows a synchronous HttpTransport and Clock and validates connection/total Duration values through TimeoutConfig at construction, without transport execution. fetch_price accepts Pair; fetch_price_str uses the existing strict parser before entering fetch. Neither arbitrary URLs, request bodies, custom request headers nor unvalidated timeouts can be supplied through the request API. MarketDataRequest fields are private, construction is crate-private, and getters expose only fixed HTTPS / GET / data-api.binance.vision / /api/v3/ticker/price plus one symbol parameter derived from typed Pair (BTCUSDT or ETHUSDT). No provider framework or new dependency was introduced.

HttpTransport::execute receives this request and returns TransportResponse or a payload-free TransportFailure (Timeout, Transport, ResponseTooLarge). Response contains numeric status, optional raw Retry-After bytes and body bytes; no raw-body Debug implementation is derived. The test-local FakeTransport captures copied requests and consumes a scripted VecDeque, panicking on unexpected calls. Production implementations are not delivered. The Vec response envelope permits deliberately oversized fake inputs to test defenses; it is not a type-level memory bound. A future production implementation must discard non-200 bodies and stream successful bodies with the cap before buffering.

Each validated fetch invokes transport once and maps typed failures. Status 418/429 returns RateLimited with retained status and optional Duration metadata; 500–599 returns ProviderUnavailable; every remaining non-200 returns HttpStatus. Those paths never inspect body bytes, so oversized, malformed or invalid-UTF-8 error bodies cannot override status. HTTP 200 checks the shared existing 16,384-byte constant before delegating to normalization. The only normalization change is making that constant crate-visible; all previous validation order and exact-price behavior are preserved.

Retry-After accepts only nonempty ASCII digits fitting u64 seconds. Missing, signed, whitespace, fractional, exponent, date-form, non-ASCII and overflowing values yield None. Zero and None never authorize an adapter retry: RateLimited is returned with no delay or second invocation. Future callers own cooldown policy. There is no sleeper seam, sleep call, scheduler, cache, fallback/default observation or client construction. ClientInitialization and actual DNS/TLS/read timeout classification remain deferred to production transport.

New MarketDataError variants are Timeout, Transport, RateLimited { status, retry_after }, ProviderUnavailable { status }, and HttpStatus { status }. Existing domain/normalization errors are preserved. Display messages are static, and error variants retain no raw upstream diagnostics or payloads.

### TDD and verification evidence
Added [fetch.rs](../../tests/fetch.rs) with 15 deterministic tests before behavior. cargo test --locked --offline --test fetch first failed E0432 for absent APIs. After introducing contract/API scaffolding and a constant InvalidResponse fetch stub, the same command executed 15 tests: 13 failed and 2 validation tests passed. A temporary unused-constructor warning occurred only while the stub did not construct requests; final code uses it and final gates have no warnings.

After implementation and cargo fmt --all, cargo test --locked --offline --all-features verified the complete suite. All four mandatory gates also passed: cargo fmt --all -- --check; cargo clippy --locked --all-targets --all-features -- -D warnings; cargo build --locked --all-targets --all-features; cargo test --locked --all-features. Actual totals: 43 passed (13 domain, 15 normalization, 15 fetch), zero failed/ignored; library/binary unit and doc-test targets have zero additional tests. No network requests, dependencies, clocks or sleeps are needed by the tests; the only clock returns fixed synthetic SystemTime. No OS-level network blocking or live deadline behavior is claimed.

### Requirements-to-tests traceability
| Requirements / acceptance criteria | Fetch tests and evidence |
| --- | --- |
| FR1–FR3, FR9 / AC1–AC2 | btc_fetch_has_fixed_request_and_normalized_observation; eth_fetch_maps_symbol_and_exact_price: fixed scheme/host/path/method, typed pair/symbol, exact observations, one invocation, fixed time. |
| FR1–FR2 / AC1 | invalid_pair_inputs_never_invoke_transport: strict input failures produce zero captured calls. |
| FR6 / AC5 partial | invalid_configuration_never_invoke_transport; valid_timeout_boundaries_reach_transport_unchanged: invalid durations fail before I/O, positive/subsecond/equal/max settings arrive unchanged. |
| FR7 / AC6 partial | transport_failures_are_typed_and_never_retried: Timeout, Transport, ResponseTooLarge propagated without fallback. ClientInitialization and real connection/read classification remain deferred. |
| FR4, FR7 / AC6 | non_200_status_precedes_malformed_or_oversized_body: 201/204/301/400/403/451/499 return HttpStatus before body handling; provider_unavailable_statuses_preserve_status_without_retry covers 500/503/599. |
| FR8 / AC7 | rate_limits_parse_unsigned_seconds_and_do_not_retry; invalid_retry_after_is_none_and_still_rate_limited: 418/429, 0/120/leading zeros/u64 maximum, absent/invalid/date/overflow values. |
| FR2, FR8 / AC7 | zero_retry_after_does_not_consume_second_scripted_response and common failure_once helper assert one call and an unconsumed success fallback after every failure. Source review confirms no sleeper, sleep call, or retry loop; tests do not use real-time assertions. |
| FR6–FR7 / AC5 partial | successful_body_limit_is_checked_before_decoding: exactly 16,384 bytes proceed, 16,385 invalid bytes return ResponseTooLarge; production streaming remains deferred. |
| FR4–FR5, FR7 / AC3–AC4 | normalization_failures_are_not_retried_or_replaced: schema, symbol and price failures preserve classification/precedence, with zero clock calls. Existing 15 normalization tests retain exhaustive DTO edge cases. |
| FR2, FR3 / AC2, AC6 partial | failure_after_success_does_not_return_stale_observation: second call fails rather than reusing the first observation; two explicit calls, one clock sample. |
| FR7, NFR3 / AC6 | fetch_error_formatting_never_exposes_upstream_payload: safe Display/Debug and no error source retaining body/header values. |
| FR9, NFR2 / AC8 | All 43 tests are deterministic, with fake transport, synthetic fixtures and fixed clocks; prior 28 tests remain unchanged and pass. |

### Remaining production requirements
This milestone verifies orchestration, not the behavior of an actual HTTP stack. Production must select/review reqwest blocking features and transitive dependencies, reuse a client, verify TLS/hostname checks, disable redirects/proxy inheritance/cookies/decompression and all supported protocol retries, implement streaming cap+1 reads (including missing/dishonest Content-Length), map initialization and connection/read failures safely, and enforce configured connect/total deadlines with documented platform limitations. It must preserve status-before-body precedence and never read non-200 bodies. Those remaining AC5/AC6/AC9 portions and full AC10/human closure are not satisfied by fake tests. Ubuntu execution of the changed code remains unverified; old hosted CI evidence applies only to the foundation.

Recommend separately authorized Phase 0.2f production transport work, with deterministic reader/error tests first and no live exchange calls, CLI integration, trading, credentials or automatic retries. No commits, pushes, deployment or changes outside the repository were performed by this milestone.
