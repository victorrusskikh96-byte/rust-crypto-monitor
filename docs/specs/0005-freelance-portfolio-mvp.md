# 0005 — Freelance Portfolio MVP

## Status
APPROVED. On 2026-10-17, the Technical Lead's M1 request authorized approval
after checking this text against reviewed M0.1 decisions. Review found no material
architectural conflict: existing adapter preserved; future Axum/Tokio +
React/TypeScript/Vite and one bounded transport-owning worker accepted.
Exact dependency versions remain candidates requiring implementation-stage
compatibility/security verification. Approval does not mean implementation or
portfolio readiness. Current authorized work is only the read-only CLI in
[0006](0006-read-only-cli.md); web/frontend/valuation implementation is not authorized.
M0/M0.1 DRAFT history is preserved below as planning evidence.

## Problem, product objective and target audience
International Upwork clients need a demonstrable example of reliable Rust backend
and usable full-stack engineering. Evolve Rust Crypto Monitor into a small local
Crypto Market & Portfolio Dashboard, preserving the existing adapter. Longer-term
Web3 employment remains a parallel objective; this is independent portfolio work,
not evidence of commercial Rust experience or an investment product.

## Recovered baseline and evidence
M0 starts from clean main at `0f95a3cf2fb638df88d382e298fc6364b8867df9`.
The earlier context SHA `7238c3e` is historical. Inspected source implements exact
prices, synchronous single-attempt Binance fetching, fixed HTTPS transport and
deterministic seams. The binary is empty; no web API, UI, portfolio persistence or
valuation exists. Existing 60 tests passed in the preceding local verification;
M0 reruns are reported separately. No current hosted CI or live access is inferred.
[Specification 0003](0003-market-data-adapter.md) remains APPROVED with AC8/AC10
partial; its acceptance gaps remain visible and require review before release.

## Goals and mandatory MVP scope
- FR1: Market Overview for BTC/USDT and ETH/USDT with canonical exact prices,
  Binance attribution and local observation timestamp; loading, success, stale
  and unavailable states. No history or invented daily change.
- FR2: Manual BTC/ETH quantities, estimated per-asset and total USDT values and
  allocation, calculated exactly on the Rust backend. Local browser persistence
  is optional per user opt-in; no server database or accounts.
- FR3: Provider Health showing last attempt, last successful observation, current
  attempt status and safe error per pair. Summarize observed outcomes, never
  announce that Binance is globally online.
- FR4: An explicit offline fixture mode demonstrates successful, partial, stale
  and failed outcomes without provider access; provenance remains visible.

## Non-goals
No trading, orders, payments, accounts, credentials, wallet connection, signing,
transactions, historical charts, 24-hour changes, provider fallback, WebSockets,
background polling, cloud hosting or deployment. No stack installation, code,
test, dependency, toolchain or CI changes in M0.
Optional Solana read-only public-address balance lookup requires its own
specification, RPC/privacy/security review and approval; it cannot block MVP.
It grants no wallet, signing or mainnet transaction authority.

## User stories and end-to-end workflows
1. A client opens the local dashboard, sees mode and untouched provider state,
   clicks Refresh once and sees independent BTC and ETH outcomes with timestamps.
2. A user enters BTC 0.1 and ETH 2, submits Calculate and receives exact estimates,
   total and allocation tied to the displayed snapshot. Editing marks the old
   estimate outdated until recalculation; stale responses cannot overwrite edits.
3. A user sees an ETH fetch fail after success: the last observation remains
   visibly stale, the latest error and attempt time appear, and the total is
   withheld until both positively held assets have fresh observations.
4. A user opts into saving quantities, reloads, sees validated restored strings
   and clears them with one action. A storage failure leaves an in-memory session.
5. A reviewer starts fixture mode using documented local commands, demonstrates
   all states, and sees a persistent “Synthetic fixture data” banner. Restarting
   in real mode clears market state and never imports fixture observations.

## Accepted design and implementation boundary
[ADR 0003](../adr/0003-full-stack-portfolio-architecture.md) accepts Option B:
existing Rust core + small Axum API + React/TypeScript/Vite frontend. One Rust
package/process will serve API and built assets; frontend build tooling remains
a separate directory. This is future architecture, not currently implemented.
M1 acceptance explicitly extends the historical CLI-only/no application async
runtime baseline at the future application boundary. ADR 0001 and specification
0003 continue governing the unchanged synchronous adapter. Its no-retry/validation/
transport contract is preserved; application stale state never becomes adapter
success. [Architecture](../architecture.md) records the accepted extension.
M1 implements only a synchronous one-observation CLI with no web dependencies.

## API contracts with example shapes
Proposed versioned JSON API; financial values, quantities, percentages, monotonic
ages and Unix epoch milliseconds are decimal strings, not JSON floating numbers.
Timestamps are signed Unix milliseconds or null when unknown/unrepresentable;
local observation times are not exchange event times. Structural counts and schema
version may be JSON integers. All responses use Cache-Control: no-store.

| Endpoint | Semantics |
| --- | --- |
| GET /api/v1/dashboard | In-memory snapshot and health only; no provider I/O. Initial state has null timestamps/observations. |
| POST /api/v1/refresh | Empty JSON object; one admitted user action attempts BTC then ETH at most once each; rate-limit/shutdown can stop the batch. Returns completed snapshot, including partial failures. |
| POST /api/v1/valuation | Validate two quantities and snapshot ID; calculate from that server snapshot only; never fetch. |

Illustrative dashboard response after one successful pair (synthetic example):
```json
{
  "schema_version": 1,
  "mode": "real",
  "snapshot_id": "7",
  "freshness_ttl_ms": "60000",
  "refresh_in_progress": false,
  "service_state": "ready", "service_error": null,
  "refresh_allowed_in_ms": "30000",
  "markets": [
    {
      "pair": "BTC/USDT",
      "state": "success",
      "observation": {
        "price": "65000.12", "quote": "USDT", "provider": "Binance",
        "observed_at_ms": "1792195200000", "provenance": "real"
      },
      "observation_age_ms": "10",
      "last_attempt_at_ms": "1792195199000",
      "last_success_at_ms": "1792195200000",
      "attempt_state": "success", "last_error": null
    },
    {
      "pair": "ETH/USDT", "state": "unavailable", "observation": null,
      "observation_age_ms": null,
      "last_attempt_at_ms": "1792195200000", "last_success_at_ms": null,
      "attempt_state": "failed",
      "last_error": { "code": "provider_timeout", "message": "Market data request timed out" }
    }
  ]
}
```
Always return exactly both pair entries. snapshot_id is an opaque generation string,
changes on any refresh state mutation, and is scoped to one server run/mode. A GET
recomputes ages; freshness expiry can invalidate valuation without changing ID.
last_success_at_ms identifies the observation time; last_attempt_at_ms is set just
before that pair actually executes, not when HTTP admission occurs.

Valuation request and successful response (illustrative fresh complete snapshot):
```json
{"snapshot_id":"8","quantities":{"BTC":"0.1","ETH":"2"}}
```
```json
{
  "snapshot_id":"8", "quote":"USDT", "state":"complete",
  "holdings":[
    {"asset":"BTC","quantity":"0.1","price":"65000.12","value":"6500.012","allocation_pct":"56.52","reason":null},
    {"asset":"ETH","quantity":"2","price":"2500.00000001","value":"5000.00000002","allocation_pct":"43.48","reason":null}
  ],
  "total":"11500.01200002",
  "allocation_rounding":"independent_half_even_2dp",
  "estimate":true
}
```
Allocation is presentation rounding only. For this two-asset complete portfolio,
complementary half-even percentages sum to 100.00; no holding value is adjusted.
Zero total yields both allocations null and an “Allocation undefined” message.
A zero quantity contributes exact zero without needing its market price (price
may be null). Any positive holding without a fresh price yields state incomplete,
that holding value null, total null and all allocations null; fresh per-asset
values may still be shown. Never present a partial sum as total.

Error envelope:
```json
{"error":{"code":"invalid_quantity","message":"Enter an unsigned decimal quantity","field":"quantities.BTC"}}
```

| HTTP status | Application meaning |
| --- | --- |
| 200 | Snapshot, completed refresh (including provider failures), or complete/incomplete valuation |
| 400 | Malformed JSON, duplicate/unknown fields, invalid schema/pair/quantity |
| 403 | Disallowed Host or Origin |
| 404 / 405 | Unknown route / unsupported method |
| 409 | Snapshot replaced or refresh in progress; reread and explicitly recalculate |
| 413 / 415 | Body over 4 KiB / unsupported content type |
| 422 | Exact valuation cannot be represented within arithmetic bounds |
| 429 | Application admission cooldown; safe retry-after metadata |
| 503 | Handler overloaded, worker unavailable/failed or service stopping; no waiting queue |
| 504 | Refresh HTTP waiter deadline expired; admitted worker may still be running |
| 500 | Sanitized internal invariant failure; never expose internals |

Map every MarketDataError to a stable safe code: UnsupportedPair to unsupported_pair;
InvalidConfiguration/ClientInitialization to configuration_error;
Timeout to provider_timeout; Transport to provider_transport;
RateLimited to provider_rate_limited; ProviderUnavailable to provider_unavailable;
HttpStatus to provider_http_status; ResponseTooLarge to provider_response_too_large;
InvalidResponse/SymbolMismatch/InvalidPrice to provider_invalid_data.
Only allowlisted upstream numeric status and integer retry_after_seconds strings may
accompany these codes. Provider errors are pair state inside a 200 refresh response,
not false API transport failures. Never return raw upstream text.

## Input validation and precision rules
- FR5: Require exactly BTC and ETH keys, string quantities, no extra/duplicate fields.
  Accept unsigned ASCII digits with optional nonempty fraction, no trimming, signs,
  exponent, commas, whitespace, NaN or infinity. Zero allowed. Maximum 32 bytes,
  8 fractional digits and quantity <= 1000000 per asset; normalize trailing zeros.
- Preserve existing Price limits: positive, <=128 bytes, <=28 fractional digits,
  96-bit coefficient; never narrow the adapter's accepted prices silently.
- Quantity times price and sum must be exact, including scale/coefficient bounds.
  Before using rust_decimal arithmetic, prove no discarded digits: form/check the
  integer coefficient product using checked u128, reduce only exact trailing zeros,
  then require scale <=28 and coefficient <=96 bits. Reject failed checked
  operations/representation as 422; do not assume checked_mul alone proves no rounding.
  Addition must align scales with checked integer operations under the same rules.
- Allocation percentages: derive two-decimal percent from exact value/total ratio
  using bounded integer long division and half-even rounding; avoid overflowing
  scaled intermediates. No new big-number dependency is assumed.
- FR6: Browser keeps decimal text; never use Number, parseFloat, floating
  multiplication, JSON numbers or chart libraries to compute financial results.
  Render authoritative server strings, including allocation percentages. Graphical
  bars may be omitted; an accessible allocation table suffices.
- Display exact canonical USDT values and an estimated-value label. Do not relabel
  USDT as USD, round holdings for computation or claim execution value.

## Freshness, health and errors
- FR7: Fresh means validated observation completed <=60 seconds ago on a monotonic
  server clock, with latest attempt successful. At exactly 60 seconds fresh;
  beyond it stale. Failure after success marks it stale immediately. No observation
  plus no attempt is unavailable/not_attempted; no observation after failure is
  unavailable/failed. Loading overlays existing state during an attempt.
- Separate wall timestamps for presentation from monotonic age/deadlines. Clock
  regression cannot rejuvenate an observation; restart clears cache and attempts.
  Prices are independent observations, never atomic or known last-trade freshness.
- UI advances returned ages with a monotonic browser timer and conservatively
  marks stale on expiry, tab resume or lost API connection pending a GET. No
  automatic provider refresh or automatic retry. GET reads on load/resume and
  after actions are allowed; offline API failure shows disconnected separately.
- Keep at most one observation and latest attempt/error per pair, no history.
  During sequential refresh update attempt state per actual call; untouched pair
  state is preserved. Last successful observation remains explicitly stale on
  failure and is excluded from positive-holding totals.
- FR8: Admit at most one refresh batch process-wide, no waiting refresh queue.
  Minimum 30 seconds between batch starts. On either pair's 418/429, stop the
  batch before remaining calls; mark unattempted pair unchanged and block refresh
  for max(60 seconds, valid Retry-After) from failure using checked monotonic time.
  Missing/zero metadata never permits immediate retry. An unrepresentable deadline
  disables refresh until restart with explicit error. No automatic retry.
  This local policy does not guarantee shared-IP quota compliance.
- Health describes last observed attempts only. Fixture health is simulated.
  Requests rejected by admission never change provider attempt timestamps.

## Security requirements and trust boundaries
Apply [ADR 0002](../adr/0002-security-by-design.md) and
[SEC-01–SEC-12 baseline](../security/security-baseline.md).
All controls below are proposed, not verified implementation.
- Browser/local storage -> API: treat persisted JSON, body, headers and snapshot IDs
  as untrusted. Validate schema before arithmetic/admission; cap body at 4 KiB,
  methods/routes/content types, finite field sizes and all application queues.
- Bind only 127.0.0.1 by default (proposed port 3000), never 0.0.0.0. Validate Host
  against exact local configured host/port to resist DNS rebinding. Local service
  has no authentication and cannot protect against hostile local processes.
- Serve production UI/API same origin. Development uses Vite on 127.0.0.1:5173
  proxying /api to 127.0.0.1:3000; no permissive CORS middleware. Reject unapproved
  Origin on API requests, including reads; mutating POST requires exact approved
  Origin and application/json. No-Origin read-only GET may support local tools;
  no-Origin POST is rejected. No wildcard/credentialed CORS.
- Bound incoming connections to 32, concurrent API handlers to 8 with immediate
  overload rejection, request header/body read budget 5 seconds, API response budget
  25 seconds, and valuation body to 4 KiB. Verify enforcement at selected server
  stack/connection accept layer; middleware alone does not cap accepted sockets.
  Static assets are fixed built files, GET/HEAD only, with no arbitrary path access.
- One dedicated synchronous worker owns, constructs, reuses and drops blocking
  reqwest transport entirely outside Tokio. At most one admitted batch, channel
  capacity one with ownership/admission preventing a second queued job. No mutex
  held across network I/O, no thread per request. Worker disconnection fails closed.
  Client disconnect or HTTP timeout cannot cancel blocking fetch; keep admission
  held until actual completion. Expose busy; never spawn replacement work.
- Preserve fixed HTTPS egress, TLS validation, no redirects/proxies/retries and
  16 KiB upstream cap, default 3/10-second adapter budgets. Two sequential calls
  are nominally <=20 seconds HTTP budgets, not a hard elapsed guarantee.
- Browser XSS -> quantities/privacy: React escaped text, no HTML injection,
  external scripts/fonts/analytics/CDNs, remote images or third-party telemetry.
  Propose self-only CSP (development HMR exceptions local and documented),
  nosniff and no-referrer; test headers. Never log request bodies, quantities,
  arbitrary headers or raw upstream errors; use bounded safe code diagnostics.
- Optional localStorage key portfolio.v1 contains schema version and BTC/ETH
  quantities only, <=1 KiB. Default in-memory, explicit save opt-in/clear, explain
  plaintext shared-browser exposure. Validate reads, ignore corrupt/oversized data,
  handle denied/quota errors, no timestamp/market cache persistence.
  Quantities are sent only to the local backend, never Binance or third parties.
- Fixture/real mode is startup-only and fail-closed: no fallback on live failure.
  Security dependency review covers direct/transitive versions/features, licenses,
  advisory snapshots, native/build scripts and platform/MSRV before installation.
  No privileged execution, secrets or unsafe-code additions are authorized.

## Offline demo / fixture policy
Use synthetic version-controlled prices and deterministic scenarios: both success,
partial failure, prior-success-stale, timeout, rate-limit and all unavailable.
Mode and per-observation provenance are mandatory, including screenshots/recordings.
Use the existing fake transport/clock seams; fixture startup must never construct
production transport or emit provider requests. Reset state on mode change/restart.
Sample fixture timestamps must be labeled simulated; never fabricate live evidence.

## Frontend behavior and responsive requirements
- FR9: Three clear regions: market overview, manual holdings form and provider
  health; visible mode badge, refresh control, per-pair errors and freshness labels.
- Input labels, units, keyboard navigation, visible focus and screen-reader status
  announcements; no color-only meanings. Support 320, 768 and 1440 CSS-pixel
  widths without horizontal page overflow, accessible tables stacking as needed.
- Preserve user inputs on provider/API failure, disable duplicate submit/refresh,
  cancel/ignore obsolete frontend requests using generation IDs. A failed
  calculation never leaves an old result labeled current.
- Explicit empty/loading/error/success states, no fabricated charts or optimistic
  prices. Show unavailable total for incomplete data, and zero-total allocation
  undefined; clearly distinguish disconnected API from a failed provider attempt.

## M0.1 execution and endpoint state machine
The Technical Lead conditionally approved Option B in M0.1 and accepted the
reviewed architecture in M1. These requirements remain unimplemented future web scope.

One purpose-built market worker thread owns construction, reuse and destruction of
ReqwestTransport outside Tokio. A capacity-one command channel accepts one refresh
batch; there is no second waiting batch and no generic worker framework. An atomic
admission/state transition covers busy check, cooldown check and successful try-send.
The worker owns the admission guard from dispatch through final state publication;
dropping the HTTP waiter cannot release it. Failed dispatch rolls back admission,
changes no attempt timestamp and returns 503 worker_unavailable. Worker panic/channel
failure sets service state failed, releases resources and disables future refresh;
never automatically respawn it. Read-only dashboard state remains accessible.

| Phase / event | Deterministic result |
| --- | --- |
| Initial browser load | GET only: no provider calls; both unavailable, attempt_state not_attempted, timestamps/error null. No implicit initial refresh. |
| Valid refresh admitted | Set refresh_in_progress true and generation; worker attempts BTC then ETH once each, subject to rate-limit/shutdown stop below. |
| Pair starts | Set attempt_state loading and last_attempt_at_ms just before adapter call; state loading overlays retained observation, if any. Retain previous last_error until completion and label it previous. |
| Pair succeeds | Replace observation, monotonic receipt time and last-success metadata; attempt_state success, error null; state success. |
| Ordinary provider failure | attempt_state failed, typed last_error; retain previous observation as stale or unavailable if none. Continue to the second pair once; never retry failed pair. |
| Provider 418/429 | Same failed-pair treatment, stop before any remaining pair; untouched pair state/timestamps/error unchanged. Set process cooldown from failure as max(60 seconds, Retry-After). |
| Refresh already admitted | POST refresh returns 409 refresh_in_progress immediately, no enqueue/join/fetch; GET still returns current state. |
| Simultaneous valid requests | Exactly one wins atomic admission; all other refreshes get 409. No per-browser queue or provider call. |
| Completion | Publish final snapshot, clear busy and notify original waiter if present. POST returns 200 even if both provider outcomes failed. |
| Cooldown without active batch | POST refresh returns 429 refresh_cooldown; no attempt mutations or provider I/O. |
| Expired/failed retained observation | state stale; observation remains visible with provenance but cannot value positive quantity. |
| No observation | state unavailable unless currently loading; safe error or not_attempted explains why. |

Allowed market state enum: loading/success/stale/unavailable. Allowed attempt_state:
not_attempted/loading/success/failed. Admission alone does not set pair loading:
the not-yet-started second pair retains its prior state. At refresh completion or
rate-limit stop no entry is left loading. One safe top-level service_state
(ready/stopping/failed) and optional service_error distinguish worker failure from
provider failure; dashboard responses must include both in addition to M0 fields.
If a worker dies mid-call, finalize that attempt with worker_failed, retain any
old observation as stale, and keep unstarted pair unchanged. No invented provider
outcome or provider HTTP status follows from worker failure.

POST refresh requires exactly {}; POST valuation requires exactly snapshot_id and
quantities, with snapshot_id a nonempty opaque ASCII string <=128 bytes.
GET rejects query parameters and nonempty bodies; POST endpoints reject query
parameters, unknown/duplicate fields and unsupported content type. Static GET/HEAD
and dashboard GET cause zero provider I/O. Valuation never fetches, queues or retries.
Only admitted POST refresh can call the provider, and only in real startup mode.

Valuation validates bounded input first, then takes one short-lock snapshot:
if refresh is active return 409 refresh_in_progress; if ID differs return
409 snapshot_replaced. Otherwise evaluate monotonic freshness at that instant and
calculate using the copied snapshot. A refresh starting after the copy cannot
change the result: response identifies its captured generation. UI conservatively
invalidates valuation on refresh, edits, quote expiry, disconnect and resume.
No-ID/stale-ID requests never initiate refresh or substitute newer prices.

GET reads are immediate snapshots and do not wait for worker completion. Initial
page loading is a frontend request state, distinct from pair loading. Another tab
may GET during refresh; no polling loop is required. After 409 it may GET once
and display busy, with later GET/Refresh an explicit user action; no automatic retry.

Cooldown is process-wide monotonic state: next permitted start is max(previous
batch start +30 seconds, provider cooldown). Busy takes precedence over cooldown.
Return retry_after_ms as a nonnegative decimal string in a 429 error and Retry-After
as ceil(remaining milliseconds/1000), never zero while blocked. Preserve original
provider retry_after_seconds only inside the failed pair. Checked deadline overflow
sets refresh disabled until restart, with service_error cooldown_unrepresentable;
do not truncate/clamp to an earlier deadline. Restart resets volatile state but is
not a recommendation to evade rate limits. Shared-IP/provider quota is unverified.

## M0.1 timeout, cancellation and shutdown
Request body/header reading has a 5-second total budget; completed request handling
has a 25-second budget measured after body validation. If the refresh response
deadline expires, return 504 refresh_wait_timeout if the socket permits it.
This means the waiter timed out, not that provider work stopped. Keep busy/guard
and allow GET to observe eventual results. AbortController, tab closure or TCP
disconnect likewise only detaches the waiter; an admitted batch continues its
normal sequence. Never send a second POST automatically after uncertain completion.
503 is for worker unavailable/admission infrastructure failure, not a provider
error or ordinary concurrent-refresh conflict. Validation errors precede admission.

On Ctrl-C: atomically set stopping, reject new POSTs with 503 service_stopping,
close listener/admission and signal worker through shared stop state plus closing
the sole sender (no shutdown job requiring queue space). A dispatched but unstarted
batch is discarded without timestamps; a running call finishes and publishes its
actual outcome, but worker checks stopping before starting the second call.
Unattempted pair remains unchanged; no fabricated failure. Complete or detach the
waiter with 503 service_stopping, clear busy after work stops, drop client on worker,
then join worker from the synchronous owner after application runtime shutdown.
Drain existing HTTP work for at most 25 seconds, then close connections. Worker
join itself has no promised hard deadline: OS/DNS can outlast configured HTTP
budgets. Report delayed shutdown honestly; no detached replacement thread, force
cancellation, retry or false successful completion. Startup waits for a single
ready/failed worker notification before listening; fixture worker never constructs
the production transport.

Application-owned runtime: one current-thread Tokio scheduler, at most 32 tracked
connection tasks and 8 active API handlers, one worker and at most one refresh
completion waiter. Acquire a connection permit before spawning its task; close an
accepted excess socket immediately without creating a waiter task. Do not spawn
per-request timer, arithmetic, logging or cleanup tasks. Timers are scoped futures.
Library internal runtime/OS resolver threads are separately reviewed and are not a
claim that the entire process contains only two threads. Keep an explicit ceiling
for any enabled library blocking pool; no unbounded spawn_blocking submissions.

## M0.1 local HTTP security enforcement
Production listener is exactly 127.0.0.1:3000, HTTP/1 only. No IPv6/public bind,
user-controlled provider URL, proxy route or outbound Host forwarding. A port change
requires validated startup configuration and exact allowlists, not wildcard matches.
Production Host must be exactly 127.0.0.1:3000; dev browser Host is
127.0.0.1:5173 and the Vite proxy must rewrite backend Host to 127.0.0.1:3000 while
preserving Origin. Do not trust X-Forwarded-Host, Forwarded or X-Forwarded-For.

Production API allows only Origin http://127.0.0.1:3000; dev startup mode instead
allows only http://127.0.0.1:5173. Do not accept both by default. Reject null,
multiple, malformed, suffix-match or other origins, localhost aliases and missing
Host. GET with absent Origin is permitted for local tools; every POST requires
one exact Origin and application/json (optional charset=utf-8 only). Enforce this
before any provider-side effect, including malformed/simple form POST rejection.
OPTIONS never fetches and returns 405 without CORS permission. Emit no permissive
Access-Control-Allow-* headers; same-origin dev proxy makes CORS unnecessary.
Set Vite loopback host, strict port, fixed /api proxy target, exact allowed host
and no proxy wildcard; its Origin header must never be rewritten to bypass checks.

Cap headers at 16 KiB total and 64 fields, request target at 2 KiB, API response
at 32 KiB, all API bodies at 4 KiB including chunked/dishonest Content-Length.
Reject unsupported Content-Encoding and overlimit before decoding/admission;
safe 400/413/431 where HTTP parsing permits, otherwise close. Apply connection
idle/header/body-read time limits of 5 seconds and the 25-second handling budget;
no indefinite keepalive holders. Reject >8 concurrent API handlers with safe
503 overloaded, without a waiting semaphore queue; static responses also count
toward the 32 connections. HTTP/2, upgrades and streaming endpoints disabled.
A minimal bounded accept/HTTP1 configuration using reviewed Hyper helpers may be
needed: Axum middleware alone cannot enforce parser/connection limits. The future web dependency milestone must
verify selected APIs/features before installation; no server framework defaults
are claimed to implement these limits.

Host/Origin checks reduce DNS rebinding and browser-driven fetch abuse, not local
authentication. Local processes, extensions, XSS or a compromised allowed UI can
forge/legitimately carry headers and read/change holdings or request refresh.
Loopback does not protect against other users on the same machine. Never expose
this unauthenticated prototype on a LAN/public interface. Error code/message/field
allowlists apply even to framework rejection/timeout paths; no raw parser/provider
text, addresses, quantities, headers or stack traces. No credential or proxy feature
is added. API diagnostics must be bounded; provider destination remains fixed.

## M0.1 financial examples and bounded arithmetic
Quantity grammar is [0-9]+ optionally followed by a dot and 1–8 digits, <=32 bytes,
numeric range 0..1000000 inclusive for each asset. Leading zeros are accepted
within length; normalize to plain canonical decimals. Reject -0, negatives, +,
blank, trailing dot, surrounding spaces and exponent notation. Test range after
exact parsing. Quantities may be zero, unlike Price. No rounding of quantity/price.

Canonical output has no exponent, unnecessary leading/trailing zeros or negative
zero; zero is "0". Monetary totals/holding values preserve every exact digit;
allocation_pct alone is a fixed-two-decimal rounded display string. Use half-even:
exact 0.005 percent -> "0.00"; exact 0.015 percent -> "0.02".
No independently rounded monetary values feed totals or allocations.

All multiplication, scale alignment and sums use checked integer coefficient
operations; zero is handled before scale multiplication. Strip exact trailing zeros
first. A 96-bit normalized result and scale <=28 are required. Checked u128
intermediate overflow is an explicit 422 arithmetic_capacity error even if an
arbitrary-precision calculation could ultimately fit: this conservative capacity
limit is part of the MVP, never silent rounding. Test that error separately from
422 unrepresentable_value (final coefficient/scale cannot fit). No panics/wrapping
or saturation. Compare allocation ratios without forming an unchecked value*10000:
bounded long division maintains remainder < divisor and uses checked operations;
a required intermediate exceeding capacity likewise returns arithmetic_capacity.
No float intermediates in parsing, display rounding, allocation or JSON.

| Holdings / quotes | Required result |
| --- | --- |
| BTC 0.1 @65000.12, ETH 2 @2500.00000001, fresh | Values 6500.012 and 5000.00000002; total 11500.01200002; percentages 56.52 and 43.48. |
| Both quantities zero, no quotes | complete; both values "0", total "0", allocation_pct null for both. |
| BTC zero/unavailable, ETH positive/fresh | complete; BTC value "0", ETH exact value is total; allocation 0.00/100.00. |
| Any positive holding with stale/missing quote | incomplete; affected value null, total null, all allocations null. Other fresh holding value may be shown. |
| Both positive with stale/missing quotes | incomplete; both values/total/allocation null. |
| Representability or intermediate failure on usable quotes | 422; no partial successful valuation or fabricated zero. |

An incomplete response uses the same response shape as complete, with state
incomplete, nullable values and per-holding reason (quote_missing/quote_stale or
null); no financial error is hidden by a missing other quote. Validate/compute each
usable holding, returning 422 on arithmetic failure before returning incomplete.
Never calculate a stale holding then merely label its total stale.

## M0.1 additional deterministic acceptance criteria
| ID | Required test before dependent behavior |
| --- | --- |
| AC13 | Start fixture server: initial GET/valuation produce zero provider calls; only explicit valid POST refresh creates a batch; BTC precedes ETH and each adapter invocation makes one attempt. |
| AC14 | Barrier-controlled simultaneous requests: one admission, others 409; capacity-one channel never retains a second batch; body/origin/cooldown failures mutate no attempts. |
| AC15 | Disconnect and fake HTTP timeout after dispatch: guard stays busy, exactly planned calls complete and GET exposes final state; no automatic retry. |
| AC16 | BTC 418/429 stops ETH; ETH 418/429 preserves completed BTC; absent/zero/valid/overflow Retry-After enforces specified cooldown; 30-second boundary checked without sleeps. |
| AC17 | Shutdown before dispatch, before first call and between calls; worker initialization/panic/channel failure; no false attempt timestamps, no overlapping/replacement worker, client destroyed on owner thread. |
| AC18 | All quantity boundaries and zero/missing/stale matrix above, monetary golden example, allocation half-even ties, sum/product/scale/intermediate overflow, no float financial conversions. |
| AC19 | Production/dev Origin/Host matrix, form/null/missing Origin, spoofed forwarding headers, OPTIONS and malformed JSON cause zero provider I/O; headers/body/target/connection/handler limits fail safely. |
| AC20 | Fake deadlines prove 504 waiter versus continuing work, stopping rejects new POSTs, handler/connection counts remain bounded; all-state/error/provenance response decoding matches frontend. |

These criteria define future tests; none is implemented or passed by documentation
validation. M0.1 preserves mandatory MVP scope and the separately approved optional
Solana boundary.

## Verification plan and deterministic test strategy
Define failing acceptance tests before each implementation step. Use existing
HttpTransport/Clock plus application monotonic clock, worker and snapshot seams.
Mandatory tests need no provider, credentials, real sleeps or external network.
Browser E2E may use a separately scoped loopback-only test server.
Backend: decimal boundary/golden cases, exact arithmetic/overflow, validation/error
mapping, fake-clock TTL boundary/regression, partial results, stale exclusion,
single-flight/cooldown/Retry-After, disconnect/admission lifetime, worker shutdown,
Host/Origin/body/path/resource rejection and no raw-payload diagnostics.
Frontend: contract decoding, all states, string preservation, outdated-result
suppression, storage corruption/denial/clear, accessibility and viewport checks.
Proposed frontend tools are Vitest + React Testing Library and Playwright; pin and
review later, with scripted fixtures and no browser tests against Binance.
Add test proving fixture mode has zero production transport construction/calls.
Record OS-enforced external-network-denied evidence separately from offline Cargo.
After approved implementation, verify clean-checkout Windows PowerShell and Linux
setup, locked installs, frontend typecheck/build/test and browser tests; exact
commands/versions belong to the approved stack milestone. Preserve four Cargo gates.
Final CI frontend/security changes need separate approval; M0 modifies none.
M0 document checks: required sections, example JSON, local links, accepted decisions
and proposed exceptions, exact four-file scope, whitespace and four Cargo gates.
New feature tests are inapplicable now because this milestone defines future behavior.

## Acceptance criteria
All criteria (AC1-AC20, including the M0.1 table above) are future release gates,
not completed M0/M0.1 results.

| ID | Requirement | Measurable evidence |
| --- | --- | --- |
| AC1 | FR1 | Both pairs display exact fixture prices/provider/time and all four states; real mode uses unchanged adapter with safe failure. |
| AC2 | FR2/FR5/FR6 | BTC 0.1 at 65000.12 + ETH 2 at 2500.00000001 equals 11500.01200002 USDT; exact per-asset values and documented rounded allocations match. |
| AC3 | FR5 | Zero/max quantities accepted; negative/sign/exponent/9 fractional digits/oversize/wrong JSON types rejected before side effects; coefficient/scale/arithmetic overflow returns 422 without rounding. |
| AC4 | FR3/FR7 | Fixed-clock tests cover 60000/60001 ms, clock reversal, not_attempted, busy, failure-after-success, null total for missing/stale positive holding and zero-total allocations. |
| AC5 | FR8 | Concurrent refresh attempts produce one batch, <=1 active provider call, no second queued batch; cooldown and 418/429 stop remaining calls; disconnect cannot release admission early. |
| AC6 | Contracts/security | Every endpoint/error code and malformed body/Host/Origin/path/size/overload case has deterministic checks; quantities never enter upstream requests/logs. |
| AC7 | FR4 | Offline scenarios reproducible with zero provider I/O; fixtures labeled in UI/API/evidence and never silently used in real mode. |
| AC8 | FR9/privacy | Form, storage opt-in/clear/failure, obsolete requests, keyboard/status accessibility and three viewport widths verified. |
| AC9 | Reproduction | Clean checkout setup and scripted demo verified on Windows and Linux with pinned versions/locks and no credentials. |
| AC10 | Quality/security | Backend/frontend checks pass; reviewed dependency/security evidence and limits recorded; hosted CI verified for exact final reviewed commit. Adapter AC8/AC10 gaps resolved or explicitly reviewed without claiming full adapter implementation. |
| AC11 | Portfolio packet | 3–5 genuine screenshots, short recording, honest English README and case study, architecture/API/security docs and scenario instructions exist and agree with actual behavior. |
| AC12 | Approval | Specification approved, ADR accepted and conflicts reconciled before code; human accepts release milestone and its residual limitations before closure. |

## Portfolio deliverables and Definition of Done
Portfolio-ready means a working application demonstrating the five workflows;
real observations when available and explicit unavailable behavior otherwise;
accurate checked valuations and provenance; reproducible setup; passing backend
and frontend tests; successful hosted CI for the exact final commit; documented
security/dependency review; accepted architecture and API documentation.
Produce 3–5 genuine application screenshots (overview, valuation, failure/stale,
fixture label and responsive view as appropriate), a 2–3 minute recording showing
success and failure paths, an English README and Upwork case study explaining
problem, contribution, architecture, tests, security and limitations. Label fixture
captures and any AI assistance honestly. No deliverable is claimed produced in M0.
Public presentation, commits/pushes and deployment each need explicit authorization.

## Incremental implementation milestones
| Milestone | Proposed reviewable outcome; approval gate |
| --- | --- |
| M0 / M0.1 | Draft specification, proposed ADR and context/roadmap; conditional Option B direction recorded and execution/security/precision contracts refined; stop for final review. |
| M1 — current CLI | Explicit Technical Lead scope: approve reviewed records and implement only one synchronous read-only CLI observation, deterministic tests and documentation; see 0006. Original M0 stack-preparation work is deferred to a separately authorized web dependency milestone. |
| M2 | Tests then pure quantity/valuation/API DTO logic, precision and error mapping; four Cargo gates and review. No network server yet. |
| M3 | Tests then bounded worker, snapshots, freshness/cooldown and loopback API with security/resource controls; fixture-only integration first; review. |
| M4 | Tests then React three-region UI, exact string contracts, persistence opt-in and responsive/accessibility behavior; reviewed frontend gates. |
| M5 | E2E/security/reproduction review and separately approved CI expansion; optional separately authorized public smoke observation, never required for offline tests. |
| M6 | Produce genuine screenshots/recording/README/case study; verify CI at final authorized commit, disclose gaps and obtain human portfolio-release acceptance. |

Each milestone requires its own approved scope, tests before behavior, verification,
review and human acceptance. Optional Solana has a separate track after basic MVP;
no M0 authorization to implement, install, commit, push or deploy.

## Dependencies and risks
Single provider/regional restrictions and no exchange event timestamp limit freshness
claims. Estimates are independent observations, not synchronized quotes or investment
advice. rust_decimal range may reject valid prices combined with large quantities;
explicit 422 is acceptable and must be demonstrated. Browser persistence is plaintext
and local APIs are not multi-user security boundaries. Native TLS dependencies,
frontend tooling and async integration add supply-chain/lifecycle work.
Blocking tasks cannot be forcibly canceled and deadlines are not hard real-time.
No live provider, final Linux runtime, new stack build, dependency advisory status
or CI coverage is established by M0.

## Open decisions
Architectural direction, runtime exception, bounded worker, refresh/precision/
security policies and API shapes are accepted through the M1 Technical Lead request.
Exact candidate/supporting/test/type versions, transitive features/MSRV/licenses/
advisories, timestamp conversion and bounded HTTP parser/asset APIs require
implementation-stage compatibility/security verification before adoption.
These are explicit implementation gates, not unresolved architecture alternatives.
No packages are approved for installation by M1. Each future implementation
milestone and eventual publication still requires its own authorization.
