# 0005 — Freelance Portfolio MVP

## Status
APPROVED. On 2026-10-17, the Technical Lead's M1 request authorized approval
after checking this text against reviewed M0.1 decisions. Review found no material
architectural conflict: existing adapter preserved; future Axum/Tokio +
React/TypeScript/Vite and one bounded transport-owning worker accepted.
Exact dependency versions remain candidates requiring implementation-stage
compatibility/security verification. Approval does not mean implementation or
portfolio readiness. At M1 approval, authorized work was only the CLI in [0006](0006-read-only-cli.md).
M2a, M2b.1 and M2b.2 were separately authorized afterward and are human-accepted.
The M2c request reports independent M2b.2 source review and successful hosted CI
for published 981b33dd601dfbcedad66dc7366df67806e85263, and authorizes operational
offline fixtures. M2c implementation evidence is appended below for review.
The complete Full-Stack MVP remains unimplemented. Latest evidence supersedes
historical absent-worker/fixture statements without erasing their original scope.
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

## Historical M0 implementation sequence (superseded by accepted M1–M3.1 scopes)
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


## M2b.1 — Local HTTP foundation evidence (2026-10-18)

**M2b.1 is human-accepted at the Product Owner's Git checkpoint request.**
The full API/MVP remains incomplete; publication and hosted verification are separate.
The resumed M2b.1 request explicitly authorizes this slice and exact dependencies.
M1/M2a acceptance supersedes older pending-review snapshots. Historical no-web-install
scope is superseded for M2b.1 only; this specification/full API/MVP is not IMPLEMENTED.

Plan executed: preserve CLI/domain; resolve/review approved dependencies; establish
failing acceptance tests; add immutable two-market state, JSON boundary and bounded
HTTP/1 connection handling; verify and document. No provider refresh, worker or UI.
New boundaries: untrusted HTTP headers/body -> DTOs and server observations -> exact
valuation. Threats: DNS rebinding, foreign-origin requests, client price/freshness
injection, resource abuse, precision loss and error disclosure. Server ownership,
strict bounded validation, exact domain arithmetic and fail-closed admission are
mandatory controls; these are implemented/tested below.

### Dependencies and supply-chain review

All direct additions have exact versions and default-features=false:

| Package | Requested features | Declared MSRV / license |
| --- | --- | --- |
| axum 0.8.9 | http1, json, tokio | 1.80 / MIT |
| tokio 1.53.3 | rt, net, sync, time, signal, macros | 1.71 / MIT |
| hyper 1.12.0 | server, http1 | 1.63 / MIT |
| hyper-util 0.1.21 | tokio, server, http1, service | 1.85 / MIT |

Hyper helpers are necessary for accept/parser controls absent from Axum's serve
helper. Cargo fetch/locked metadata show 185 -> 194 packages: axum 0.8.9,
axum-core 0.5.6, errno 0.3.14, httpdate 1.0.3, matchit 0.8.4, mime 0.3.17,
serde_path_to_error 0.1.20, signal-hook-registry 1.4.8, tokio-macros 2.7.2 added.
No pre-existing package version was removed/changed; Tokio stays 1.53.3. Registry
checksums are locked; Axum archive/tag correspondence was verified in the preceding
evaluation. Installed manifests, license files and relevant server/body/runtime
sources were inspected; no complete line-by-line source audit is claimed.

New licenses are MIT or MIT/Apache-2.0 alternatives except matchit: MIT AND
BSD-3-Clause, including LICENSE.httprouter. New declared MSRVs are <=1.80;
matchit/mime declare none. Rust 1.99.0 Windows compilation passed. Selected
net/signal dependencies support Windows/Unix; Linux execution is unverified.
No new build.rs/native C build was added. tokio-macros is a proc macro using
already locked helpers; existing AWS-LC/native/platform versions remain unchanged.

Feature unification: reqwest keeps blocking/rustls; Hyper keeps client/http1 and
adds server; hyper-util adds server/service. Tokio adds signal/macros to existing
io-util/bytes/net/rt/sync/time, without full, rt-multi-thread or test-util.
serde_json unifies std/default with raw_value via Axum; its existing build script
remains. Unified transitive defaults are not direct default-feature requests.
HTTP/2 and WebSockets are not enabled. Reproduce with cargo metadata --locked
--offline --format-version 1 and cargo tree --locked --offline -e features.

Fresh cargo-audit 0.22.2 (binary SHA-256 matched the previously verified
BB19A80ED88307CFB406739D7BE9545985F1D809651818247C2108D25E544114) returned exit 0:
194 packages, zero vulnerabilities/warnings. Command: audit --file Cargo.lock
--db <temporary-dir>/advisory-db --url https://github.com/RustSec/advisory-db.git
--deny warnings --json. No ignores, severity/target filters, stale/no-fetch/no-yanked
bypass. RustSec: 1,338 advisories, revision
999ec89d5d3f10f20be14750ec8c2d8b44e0ac9b, updated 2026-10-17T15:23:59Z.
Report: local temporary rust-crypto-m2b1-review/audit.json, outside the repository.
Results are snapshot-limited; security CI/update monitoring are not implemented.

### Endpoints, security and deterministic evidence

[src/http](../../src/http/mod.rs) exposes one run entrypoint. `--serve` uses a
current-thread runtime/blocking-pool ceiling one and exactly 127.0.0.1:3000.
Production state is empty/immutable, mode real; fixtures/gates are test-only.
No provider client can be constructed through the HTTP module. GET returns the
approved complete dashboard shape/two markets with recomputed monotonic ages.
POST accepts exactly bounded snapshot_id and BTC/ETH strings; unchanged Portfolio
code produces exact canonical monetary strings, incomplete/null totals and
half-even allocation. Mismatched IDs return 409 without substituting prices;
expired prices invalidate valuation even if ID is unchanged. IDs are run-local,
printable ASCII <=128 bytes, not authentication tokens. Unix milliseconds use
integer floor conversion, including before epoch.

| Control | Enforcement and evidence |
| --- | --- |
| 32 tracked connections | Bounded JoinSet and nonwaiting permit before spawn; actual 33rd socket closes. Completed tasks reaped; permits recover after timeout; shutdown collects all tasks. |
| 8 active handlers | Nonwaiting admission covers body read/calculation; 8 incomplete requests hold slots, ninth gets safe 503, no waiting queue. |
| Headers/target | Hyper caps 64 fields, 16 KiB header/start-line/trailer bytes and 16 KiB parser buffer; target <=2 KiB. Exact/excess boundary socket tests pass. |
| Body/response | <=4 KiB body data including chunked input, independent of Content-Length; bounded frame collector uses Hyper Body API, no custom HTTP parser. Response <=32 KiB with static 500 fallback. |
| Deadlines | One scoped 5-second monotonic header/body budget from acceptance, then 25 seconds for handling/response writing; controlled clock/gate tests cover expiry and simultaneous completion precedence. No timer/handler task per request. |
| Host/Origin/CORS | Exact configured Host/Origin, duplicates/null/missing/foreign rejection, no forwarding-header trust; GET may omit Origin, POST requires it. No CORS permission emitted; only production origin enabled. |
| Input | Strict JSON keys/types, unknown/duplicate/missing fields rejected; no client prices/ages/freshness, query or nonempty GET body. JSON Content-Type with optional UTF-8 charset only; content encodings rejected. |
| Errors/headers | Static 400/403/404/405/409/413/415/422/500/503 envelopes; every emitted response has no-store, nosniff, no-referrer and restrictive JSON CSP. Early parser failures close before any framework response through a write-permission IO adapter that parses no protocol bytes. Timeouts close too. |
| Shutdown | Ctrl-C stops acceptance/admission, stopping POSTs get 503 when readable, <=25-second drain; controlled test proves all connection tasks and permits collected. |
| Egress/privacy | No refresh route, worker, provider transport, arbitrary outbound URLs, credentials or request logs; repeated GET/valuation leave state untouched. No OS-enforced egress denial is claimed. |

Keepalive is disabled: one request per socket, no indefinite idle holders. HTTP/2,
upgrades, Expect/100-continue and streaming are rejected/disabled. Early malformed
HTTP, parser overlimits and expired budgets close without a response. API ready
means process readiness, not provider availability. refresh_allowed_in_ms "0"
records no cooldown; it does not enable the absent refresh endpoint. Vite/dev mode
and static frontend assets remain deferred.

### Executed verification and remaining work

- Baseline: four exact Cargo gates, 105 tests passed at clean main
  1d43a876e06fcfdcfc026ee3c6faec153a86febe.
- TDD: acceptance suite first failed with missing module E0583. Additional tests
  reproduced wrong deadline/completion precedence, malformed chunk 413 classification
  and pre-epoch millisecond truncation; fixes made all pass.
- Final Windows gates passed: cargo fmt --all -- --check; cargo clippy --locked
  --all-targets --all-features -- -D warnings; cargo build --locked --all-targets
  --all-features; cargo test --locked --all-features.
- 137 passed, zero failed/ignored: 105 preserved +30 HTTP unit/network +2 executable
  startup/dispatch. Golden 11500.01200002/tiny exact strings, missing/stale/zero,
  distinct 422 errors, snapshot conflicts, malformed input, sanitization and limits.
- Actual debug binary --serve smoke passed: dashboard 200/empty, valuation 200/total
  "0", foreign Origin 403. The owned smoke process was terminated for cleanup;
  that is not an OS Ctrl-C test.
- Market-data core, portfolio, CLI runner/prior tests, fixtures, toolchain, CI and
  accepted ADRs preserved; only main dispatch extended. No live Binance request,
  staging/commit/push, deployment, frontend or worker integration occurred.
- Linux runtime, hosted CI for this uncommitted work, OS network isolation,
  hostile-local-process protection, whole-process memory/load guarantees and
  unknown-vulnerability freedom remain unverified. Deadlines are cooperative,
  subject to OS scheduling; synchronous financial computation is bounded.

After review/acceptance, M2b.2 needs separately approved tests/implementation for
the transport-owning worker, mutable snapshot state machine, explicit refresh,
cooldown, cancellation and shutdown. Preserve the implemented security limits.

Additional local security evidence: Gitleaks 8.30.1 executable SHA-256 matched
17157E2EE8B76FC8B1D8BEE607A250E34B8A8023C8BC81822D4B5EE4D78FCB7C.
A temporary 42-file tracked/nonignored-untracked snapshot returned exit 0, zero
findings, embedded default rules, full redaction, no baseline/ignore exceptions
and source allow-comments disabled. Ignored target/.git and history were excluded;
no history rescan or external upload. This precedes this scanner-summary paragraph.
Reports remain outside the repository in rust-crypto-m2b1-secrets-ezvy90cf.


### Accepted M2b.1 Git checkpoint (2026-10-18)

The Product Owner accepted this narrow HTTP foundation and authorized exactly one
commit (`feat: add secure local rust http api foundation`), a normal non-force
push to origin/main and hosted CI verification for that exact resulting SHA.
Pre-commit recovery confirmed main, local origin/main and remote origin/main all
at 1d43a876e06fcfdcfc026ee3c6faec153a86febe; the index was empty and only the
12 reviewed M2b.1 files were pending. No source/dependency/test changes were made
during checkpoint review. The final Windows four Cargo gates were rerun and
passed with 137 tests, zero failed/ignored. Existing scanner binaries were
integrity-checked; checkpoint scan results and the final hosted conclusion are
reported in the checkpoint response, not inferred from historical evidence above.
The earlier uncommitted/pending-review/local-only statements record implementation
phase evidence. This authorization supersedes their publication restriction for
this one checkpoint only. No full-specification IMPLEMENTED status, M2b.2 work,
new package, CI change, live provider call or deployment is authorized.


## M2b.2 implementation evidence (2026-10-18; review pending)

### Scope, baseline and test-first evidence

The human authorized only the bounded market worker, POST refresh, mutable dashboard
snapshots and valuation integration. No new dependency, frontend, operational fixture
startup, polling/retry, live provider request, commit, push, CI change or deployment.
Status remains APPROVED. M1/M2a/M2b.1 are accepted; M2b.2 acceptance and full release
criteria remain pending. Historical evidence above retains its original scope.

Recovery matched clean main/local origin/main to
2a0881770356ebdb8791803364e9aec91eac1a72 and reproduced all 137 baseline tests.
Relevant 0003/0005/0007, ADRs 0001/0003 and SEC-01–SEC-12 were reviewed. Acceptance
tests were added first and failed on missing worker/state APIs. A malformed-body
test exposed Serde accepting [] for an empty struct; final validation requires an
actual JSON object with zero members. Scalar/null/unknown/duplicate-member inputs
cannot admit work. Clippy style/test-scope findings were fixed without suppressions.
All 137 previous tests remain; the old absent-refresh assertion now expects 503
in its intentionally workerless harness. A Windows documentation encoding mismatch
was corrected and final documents checked as UTF-8.

### Worker, admission and snapshot ownership

[src/http/worker.rs](../../src/http/worker.rs) owns one named std thread and a
capacity-one sync_channel. The factory constructs ReqwestTransport on that thread;
it uses and destroys the client there, including unwinding. No Send/Sync bound was
added to HttpTransport/Clock. Adapter construction remains local, with unchanged
defaults/fixed HTTPS destination and no retry. Startup awaits a ready/failed oneshot
before binding/listening; construction makes no request. Initialization failure
prevents listening with a static diagnostic.

The existing Snapshot has one short-held std Mutex. It contains the sole command
sender, admission, cooldown, service health and two fixed market slots. One lock
covers service/busy/cooldown checks, nonblocking try_send and admission publication.
The worker cannot start until this lock releases. No second batch can be admitted
or queued. No per-request thread, blocking runtime send/recv, replacement worker or
generic executor. Failed dispatch changes service health only; no attempt, quote or
start cooldown is fabricated. A once-only flag also rejects worker replacement.

Each command owns its bounded completion sender; the HTTP receiver owns no admission
guard. Actual batch completion or worker-exit cleanup alone releases busy. GET reads
state during fetches. No state lock covers provider I/O or financial calculation.
Valuation validates quantities, checks stopping, busy before ID, then copies one
ID/two markets/monotonic instant and calculates outside the lock. Later refresh
cannot substitute prices in that response. Valuation never fetches.

Only the pair actually starting receives loading/last_attempt_at_ms. Retained error
is labeled last_error_is_previous: true while loading; this optional field is absent
otherwise. Success publishes an actual validated observation/monotonic receipt time
and clears error. Failure retains the old quote as stale, or remains unavailable
without a quote. Ordinary failure continues to ETH once; 418/429 stops remaining
calls with untouched metadata preserved. Worker death finalizes only loading
attempts as worker_failed, retains old quotes stale, sets service failed and disables
refresh without respawning. Health describes observed outcomes, not global Binance
availability. No provider HTTP status is invented for worker failure.

Run-local generation changes under the same lock on admission, actual pair start,
result, completion and relevant service/worker mutations. GET recalculates age
without generation mutation. Freshness is age <=60 seconds and latest attempt
success; failed attempts immediately exclude retained prices. A monotonic high-water
mark prevents clock regression rejuvenating observations or erasing cooldown.
State-to-clock lock order is fixed; clock lock never spans acquiring state. Financial
values, ages and cooldowns remain strings; schema/status metadata use integers.

### Endpoint, rate limits, cancellation and shutdown

- Host/Origin, method/route, media type/body bounds and exact schema validation precede
  admission. Malformed refresh remains 400 while stopping. Valid admission checks
  stopping/unavailable, active 409, then cooldown 429.
- Completed batches return 200 including provider failures. Safe provider codes carry
  only allowlisted numeric status/parsed Retry-After. No client URL, price or secret
  enters the worker.
- Monotonic start spacing is >=30 seconds. 418/429 blocks for max(60 seconds, valid
  Retry-After) from actual failure, checked against the start deadline too. Missing,
  zero, invalid or u64-overflow metadata uses the minimum. Seconds that parse but
  cannot form an Instant deadline disable refresh until restart with service_error
  cooldown_unrepresentable. Restart is not guidance to evade provider limits.
- Local 429 emits retry_after_ms and ceil-second Retry-After, never zero while blocked.
  Busy precedes cooldown; rejected admission changes no provider metadata. This local
  policy does not establish shared-IP quota compliance.
- Disconnect/HTTP timeout detach the waiter only. At 25 seconds, refresh can emit
  504 refresh_wait_timeout if the socket accepts one immediate nonblocking completion
  poll; otherwise it closes. No additional write budget/timer task. Admission remains
  busy until actual completion; no retry or cancellation of blocking work.
- Shutdown atomically stops admission and closes the sole sender; no shutdown command
  needs queue space. Unstarted work is discarded without attempts. A running call
  finishes and publishes its actual outcome, then checks stopping before ETH.
  Waiters can receive 503 service_stopping. The original <=25-second cooperative
  HTTP drain remains. The synchronous owner drops the application runtime, then
  joins the worker. OS/DNS can delay joining; no hard worker deadline, forcible
  cancellation or detached replacement is claimed.

### Deterministic acceptance coverage

[src/http/worker_tests.rs](../../src/http/worker_tests.rs) adds 19 tests. Fake
transport asserts construction/use/drop on its owner outside Tokio. Synchronization
gates/oneshots and controlled monotonic/wall clocks replace scheduling sleeps.
Real five-second test watchdogs detect hangs, not acceptance timing.

| Criterion | Verified backend evidence | Remaining scope |
| --- | --- | --- |
| AC13 | Initial GET/valuation zero calls; explicit POST creates one BTC-first/ETH-second batch; exact golden valuation after fake observations | Operational fixture startup/browser workflow deferred |
| AC14 | Simultaneous socket POSTs admit one; no second batch; invalid schema/Host/Origin/media and cooldown have no provider effects; failed dispatch rolls back | OS/load behavior beyond bounded tests unverified |
| AC15 | TCP disconnect and controlled 504 retain busy; planned calls complete, no retry, GET exposes results | Browser AbortController integration deferred |
| AC16 | BTC 418/429 stops ETH; ETH 429 retains BTC; absent/zero/120/u64-overflow/unrepresentable deadlines; exact 29999/30000 and provider cooldown boundaries | Shared-IP/provider quota/live wire behavior unverified |
| AC17 | Stop before admission, gate before first call, shutdown during BTC/between published BTC and ETH; initialization error/panic, disconnected dispatch, worker panic before/after success; owner destruction and no respawn | Actual OS Ctrl-C and hard DNS/client destruction timing unverified |
| AC20 backend | 504 versus ongoing work; 503 stopping; prior 32-connection/8-handler/body/header/target/deadline tests preserved; loading/service/error/provenance response decoding | Frontend decoder/browser coverage and full MVP completion deferred |

TTL expiry without generation change, stale IDs, active-refresh valuation rejection,
every safe MarketDataError code, stale-price exclusion, previous-error labeling and
clock regression are verified. Existing exact M2a arithmetic and all security/resource
regression tests still pass. Test seams cannot be selected through production input.

### Verification, security review and limits

All four exact Windows gates executed successfully:

```powershell
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo build --locked --all-targets --all-features
cargo test --locked --all-features
```

156 tests passed, zero failed/ignored: 137 preserved +19 worker/state tests.
No live Binance requests. Git/source review confirms adapter, portfolio, CLI,
external test suites/fixtures, manifest/lock, CI, toolchain and ADRs unchanged.
Existing connection/handler/parser/body/response limits remain enforced.

Security review covered HTTP-to-worker/worker-to-snapshot trust boundaries, atomic
admission, cancellation ownership, lock ordering, bounded commands/tasks, rate-limit
overflow, safe errors, consistent snapshots and exact arithmetic. No unsafe code,
credential/configurable-URL path, logs or dependency changes. No new dependency/
source/feature/MSRV/license/native exposure; existing AWS-LC/native/platform and
full-source-audit limits remain. Reqwest's private current-thread runtime/resolver
facilities remain separate from the app current-thread runtime/blocking-pool ceiling
one. There is no whole-process two-thread claim or claim that the application command
channel bounds library internal queues/OS buffers. No new unbounded app work exists.

Integrity-checked cargo-audit 0.22.2 returned exit 0 for 194 packages, zero
vulnerabilities/warnings. Fresh RustSec: 1338 advisories, revision
999ec89d5d3f10f20be14750ec8c2d8b44e0ac9b, updated 2026-10-17T15:23:59Z;
no ignores/severity/target filters or stale/no-fetch/no-yanked bypass. Command:
audit --file Cargo.lock --db <temporary-review>/advisory-db
--url https://github.com/RustSec/advisory-db.git --deny warnings --json.
Report: temporary rust-crypto-m2b2-review/audit.json, outside the repository.
Scanner traffic is not provider traffic. Secret-scan evidence is recorded below.

Remaining limits: no Linux/hosted verification of this uncommitted work, OS-enforced
external-network denial, live DNS/TLS/provider test, hard OS/DNS shutdown bound,
actual Ctrl-C test, hostile-local-process authentication, exhaustive source/native
audit, complete memory/load/security assurance or provider quota guarantee.
Operational fixture mode, Vite/dev Origin, static assets, frontend and full release
ACs remain pending. Backend is ready for human M2b.2 review before separately
authorized M3 React Dashboard work. No milestone closure is inferred.

Additional M2b.2 security evidence: integrity-checked Gitleaks 8.30.1 returned
exit 0 with zero findings across 44 tracked/nonignored-untracked files, including
the new worker/tests. A temporary copy outside the repository excluded ignored
target/.git; embedded default rules, full redaction, empty ignore file, no baseline
or exceptions, and source allow-comments disabled. History was not rescanned.
No repository upload or new scanner installation. Report directory: rust-crypto-m2b2-secrets-uminpf2k.
This scan precedes only this evidence paragraph; source/final implementation was
included. Pattern scans cannot prove absence of all secrets.


### M2b.2 Git checkpoint authorization (2026-10-18)

The Product Owner explicitly authorized final verification, exactly one commit
with message feat: integrate bounded market refresh worker, one normal non-force
push to origin/main, and Actions verification for that exact new SHA. Recovery
confirmed main at 2a0881770356ebdb8791803364e9aec91eac1a72, an empty index and
only the seven expected M2b.2 files. Final architecture review found no material
worker/concurrency/financial/shutdown defect requiring implementation changes.
All four required local Cargo gates were rerun successfully with 156 tests,
zero failed/ignored. No source, test, dependency, toolchain or CI changes were
made during this checkpoint review. Fresh scanner results are reported with the
checkpoint; earlier scanner records retain their original scope and timestamps.

Earlier uncommitted/no-publication statements describe implementation-stage
evidence; this authorization supersedes that restriction for this one checkpoint.
The published SHA and exact hosted result are reported after publication, never
inferred from an older run. Independent Technical Lead review, full-specification
acceptance and historical operational limitations remain pending. No frontend,
fixture startup, live provider request, additional commit or deployment is allowed.

## M2c — Operational offline fixture mode (2026-10-19; Technical Lead review pending)

### Authorization, recovery and acceptance plan

The human's M2c request authorizes implementation of the existing FR4/AC7 fixture
boundary, six fixed scenarios, deterministic tests, four Cargo gates and documentation.
No new architecture or dependency is introduced. M2b.2 is human-accepted after
independent source review and successful hosted CI, as reported in that request.
Recovery independently verified clean main/origin tracking at published HEAD
`981b33dd601dfbcedad66dc7366df67806e85263` and reproduced all 156 tests.
Hosted CI was not re-queried during M2c. Historical evidence above retains its scope.

Plan: test startup grammar/factory selection first; reuse the bounded worker and
adapter with fixed in-memory responses; label simulated API data; test exact
valuation, freshness, cooldown, reset/isolation and HTTP protections; run all gates;
review unchanged dependencies and document evidence; stop for human review.

Threat review before implementation: CLI arguments cross the new startup-selection
boundary; wrong-mode construction could create unintended provider egress, and
unlabeled synthetic data could masquerade as real financial/health evidence.
Controls: closed typed scenario allowlist, validation before startup side effects,
one explicit factory-selection boundary, no fixture URLs/files/environment settings,
no production transport reference in the fixture implementation, startup-only
immutable selection, fresh per-run snapshots and fixture labeling on all application
responses. Existing SEC-02/03/06/08/09/12 controls, public-data-only scope, bounded
resources and exact/stale-excluding portfolio arithmetic remain applicable.
No new secrets, persistence, authentication, privileged or financial operations.

Acceptance tests were written before implementation. The first command
`cargo test --locked --all-features fixture_tests` failed to compile on the missing
ServerMode/FixtureScenario/for_mode/start_worker APIs. After implementation, all
11 focused tests passed. Two executable startup tests were also added.

### Startup, isolation and output contract

[src/main.rs](../../src/main.rs) accepts only `--serve` or
`--serve --fixture <scenario>` as server commands; other input passes through the
existing strict CLI validation (usage exit 2 before fetch). Both existing pair
CLI commands remain unchanged. Supported exact case-sensitive identifiers:
success, partial, stale, timeout, rate-limit, unavailable. Missing/extra/reordered,
unknown, whitespace, URL/path and non-Unicode scenario input cannot start a server.

[http::start_worker](../../src/http/mod.rs) is the single construction boundary used
by run_mode and tests. Real mode invokes only its production factory; fixture mode
does not invoke that factory and starts the existing Worker with FixtureTransport.
[fixture.rs](../../src/http/fixture.rs) has no networking, HTTP client, file access,
credentials, mutable script or retry path. Fixed tiny JSON successes normalize
through the existing MarketDataAdapter; errors use existing typed classifications.
Real-mode construction does not load synthetic observations or wrap its clock.
The real destination, TLS, retry policy, adapter, portfolio, manifest and lockfile
are unchanged. Existing run() remains a real-mode wrapper.

The same 32-connection/8-handler server, 4 KiB body, parser/response bounds, Host and
Origin checks, capacity-one worker channel, single-flight admission, 30-second start
spacing, monotonic 60-second freshness and conservative rate-limit handling apply.
Only explicit valid POST refresh simulates attempts; GET and valuation never do.
All outcomes are immediate local simulations, without invented elapsed network time.

| Scenario | Synthetic state and explicit refresh contract |
| --- | --- |
| success | Initially empty; refresh succeeds BTC then ETH at exact prices 65000.12 and 2500.00000001 |
| partial | Initially empty; refresh succeeds BTC then simulates ETH Timeout |
| stale | Initially two synthetic observations aged 60,001 ms, null attempt timestamps/not_attempted; refresh simulates both Timeout and retains stale prices |
| timeout | Initially empty; refresh simulates Timeout for both pairs |
| rate-limit | Initially empty; BTC simulates status 429 with Retry-After 120 seconds, stops before ETH, enforces 120-second cooldown |
| unavailable | Initially empty; both pairs simulate ProviderUnavailable with status 503 |

Wall timestamp labels advance from fixed simulated epoch milliseconds 1792195200000
by monotonic elapsed process time. Stale seed timestamp is 1792195139999;
last_success_at_ms refers only to that seeded observation. Neither a real nor a
simulated attempt occurred at preload. Each explicit refresh repeats its fixed
outcome after admission; no polling/retry, scripting or general fixture framework.

All emitted fixture application responses, including errors/valuations, have
mode=fixture, provenance=fixture and a fixture object with scenario and a static
synthetic-data/simulated-local-health notice. Existing observation provenance is
fixture. Existing provider=Binance is simulated schema attribution only; no live
provider evidence or global availability claim. Real response schemas are unchanged.
Parser failures/expired budgets can still close sockets without an application JSON
response. No headers, URLs, upstream text or quantities are logged.
README contains all six exact startup commands, manual refresh/valuation commands,
synthetic timestamp semantics, expected states and retained cooldown/freshness.

### Deterministic tests and verification

[fixture_tests.rs](../../src/http/fixture_tests.rs): 11 tests cover exact startup
forms and rejection; all six operational scenarios; a panic-on-call production
factory in every fixture scenario; real factory invocation without execute; unchanged
real/fixture/restart state isolation and snapshot conflicts; no initial attempts;
complete/partial/zero/missing/stale valuations; exact golden total 11500.01200002
USDT and 56.52/43.48 allocations; expiry at 60,000/60,001 ms; start admission at
29,999/30,000 ms; cooldown at 119,999/120,000 ms; unattempted ETH; unchanged attempt
metadata on local rejection; fixture labels on application errors; Host/Origin,
unapproved Vite Origin, body/schema and handler-limit rejection.

[http_startup.rs](../../tests/http_startup.rs): two added subprocess tests prove
invalid fixture syntax exits 2 and all six valid scenario startups fail closed on
an occupied fixed loopback port, with only static diagnostics.
Prior 156 tests and assertions are preserved. Tests use the application's own
loopback API, fixed synthetic inputs, controlled clocks and completion channels;
no upstream test servers, live provider requests, credentials or arbitrary sleeps.

All four mandatory Windows Cargo gates executed successfully:

```powershell
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo build --locked --all-targets --all-features
cargo test --locked --all-features
```

Final full suite: **169 passed, zero failed/ignored** (156 preserved +13 added).
Breakdown: library 76, CLI 13, domain 13, fetch 15, HTTP startup 4, integration 1,
normalization 15, portfolio 32; main/doc-tests zero cases.
An initial all-target build failed with Windows LNK1104 while the earlier filtered
test runner still owned an executable. After that runner completed, the exact
build gate and full test gate passed sequentially without a source change.
The initial failure is not counted as a passed gate.
Locked dependency inspection: `cargo tree --locked --offline -e normal --depth 1`.
Final document/link checks and `git diff --check` passed; no placeholder evidence
remains. These checks do not establish live connectivity or OS egress isolation.

Security review: factory exclusion tests plus source inspection establish fixture
construction/egress isolation; this is not an OS firewall or packet-capture proof.
All prior HTTP security/resource and exact arithmetic tests remain in the suite.
Cargo.toml/Cargo.lock, dependency sources/versions/features, MSRV/toolchain, CI,
native/build dependencies and licenses are unchanged; the locked direct dependency
tree was inspected. No new unsafe code or dependency exposure. Advisory and secret
scanners were not rerun; the dated M2b.2 reports above are historical evidence only.
No current vulnerability-free graph, exhaustive source/native audit or complete
secret absence is inferred.

Remaining limits: local Windows evidence only for M2c; no hosted/Linux run,
OS-enforced egress-denied execution, real provider smoke or actual Ctrl-C test.
No prolonged loading/HTTP-504 latency simulation (existing controlled worker tests
cover timeout/disconnect semantics). No browser UI, banner rendering, Vite Origin/
proxy integration, assets, frontend packages or full MVP acceptance. Loopback is
not authentication against hostile local processes. No commit, push or deployment.
Backend fixture contracts are ready for Technical Lead review before separately
authorized React Dashboard work; specification status remains APPROVED.

## M2c.1 remediation and resumed M2c checkpoint (2026-10-19)

The first M2c checkpoint stopped before commit/push when the two port-3000
subprocess tests raced. Both previously accepted AddrInUse without owning a
listener; after the competing test released its port, a later fixture child
started serving and the unbounded output() wait hung. Only that verified child
was stopped. The failed checkpoint did not establish 169 passing tests.

The separately authorized M2c.1 fix changed only tests/http_startup.rs. A shared
test-only mutex serializes both fixed-port tests. Each must successfully bind its
own 127.0.0.1:3000 listener before spawning; external ownership fails clearly without
a child. A reservation retains the listener through child exit, releasing it before
the mutex. All four startup tests use a 30-second monotonic watchdog; timeout
terminates and reaps only the owned Child, with a Drop guard for panic cleanup.
File-backed stdout/stderr capture avoids pipe deadlocks; reads reject output over
4 KiB per stream and the two files/directory are removed on normal return/unwind.
The read cap is not an OS disk quota; removal is best effort. Known startup output
remains empty stdout and one short static stderr line. OS spawn/termination/reaping
have no hard real-time guarantee. No source/dependency/CI/toolchain changes.

M2c.1 local evidence: targeted 4/4 startup tests passed, full 169/169 passed under
normal parallel execution, five further parallel startup-suite repetitions passed,
all four Cargo gates passed and no subprocess/listener/capture remained.
The Technical Lead explicitly accepted this remediation in the resumed checkpoint
request. Recovery hash comparison confirmed all other 45 repository files matched
the pre-remediation snapshot. Other HTTP tests use ephemeral listeners; the CLI
subprocess test uses invalid pair arguments and never serves.

The Product Owner's authorization remains limited to exactly one commit named
`feat: add isolated offline fixture scenarios`, one normal non-force push to
origin/main and verification of Actions for that exact SHA. Approved scope is
the ten M2c files, including the accepted test remediation and documentation.
No amendment, corrective follow-up commit, frontend, dependency adoption, live
provider request or deployment is authorized.

Resumed checkpoint verification ran all four exact Cargo gates successfully:
fmt --check, locked all-target/all-feature Clippy with -D warnings, locked
all-target/all-feature build and locked all-feature test. **169 passed, zero
failed/ignored**. A separate `cargo test --locked --all-features --test http_startup`
passed 4/4 with normal parallel settings. No startup child, port-3000 listener or
capture directory remained. Production adapter/TLS/retries, portfolio domain,
Cargo.toml/Cargo.lock, CI and toolchain remain unchanged. Final documentation
links/diff and staged-scope checks precede publication; no full-MVP closure.

Existing integrity-checked cargo-audit 0.22.2 was rerun with advisory fetching:
194 packages, exit 0, zero vulnerabilities/warnings. RustSec snapshot: 1338
advisories, revision 999ec89d5d3f10f20be14750ec8c2d8b44e0ac9b, updated
2026-10-17T15:23:59Z. No ignored advisories, target/severity filters, stale/no-fetch
or yanked-check bypass. Existing Gitleaks 8.30.1 is used for final working-tree
and reachable-history scans with embedded default rules, full redaction, no
baseline/exceptions and allow-comments disabled; results are in the checkpoint
report. No scanner installation. Reports remain outside the repository in the
temporary rust-crypto-m2c-publication directory. Scanner findings are dated,
scope-limited evidence, not enduring guarantees or a complete native/source audit.

A bounded compiled-binary smoke passed for `--serve --fixture success`, after
tests completed and port 3000 was verified free. A hidden child owned the verified
127.0.0.1:3000 listener before any request. Initial GET had fixture/scenario notices
and no observations. One explicit synthetic POST refresh produced BTC 65000.12
and ETH 2500.00000001; valuation for BTC 0.1/ETH 2 returned exact decimal strings
6500.012, 5000.00000002, total 11500.01200002 and allocations 56.52/43.48.
The smoke stopped/reaped only its own child with no listener remaining; it did
not test graceful Ctrl-C. No real-mode refresh or provider request. Factory-exclusion
tests and source review remain the construction/egress evidence, not packet capture
or OS-enforced network denial.

The exact published SHA and hosted Formatting/Clippy/Build/Tests conclusion are
reported after publication; this pre-publication evidence cannot claim future
hosted success. M2c remains subject to independent review, specification status
stays APPROVED, and M3 frontend dependency approval/implementation remains separate.

## M3.1 approved local scope (2026-10-19)

The Product Owner accepts all previous milestones through M2c, confirms published
baseline 3f76710df5b0cda6ebbe9ad7dfc1da098dbde06e on main, and explicitly approves
M3.1 — Multi-Agent React Foundation & Secure Rust API Integration. This supersedes
older deferred-frontend and pending-M2c status text at their historical checkpoints.
Specification status stays APPROVED; neither full MVP release nor M3.1 human
acceptance is inferred from implementation.

Approved slice: Node24.22.0/bundled npm11.19.1 from the verified official release;
13 exact frontend pins and reviewed lock; minimal React shell with one dashboard
GET; strict runtime contracts preserving financial strings; fixed loopback Vite
proxy; explicit mutually exclusive Rust production/development Origins; genuine
Coordinator plus three subagents; deterministic fixtures/tests and documentation.
No full dashboard/calculator, polling, retries, browser harness installation, CI,
provider request, global Codex/model configuration, commit/push or deployment.

The current names are M3.1 React Foundation & Secure Rust API Integration and
M3.2 proposed Market Dashboard (requires separate specification/approval). Historical
M0 M3-backend/M4-frontend labels above are not current milestone authorization.

New trust boundaries: npm packages/native binaries -> developer machine;
untrusted API JSON -> React state; browser headers/files -> Vite -> Rust.
Controls: exact-lock script-disabled installation, bounded strict response decoder,
opaque tokens/decimal strings, static safe errors, React escaping, early exact Host
and sensitive-file denial, frontend-only filesystem allowlist, fixed proxy target,
Origin preservation, closed mode selection, and no HMR/WebSockets/permissive CORS.
Local processes remain unauthenticated. The development CSP allows inline styles
for Vite CSS injection; no external scripts/fonts/telemetry or browser destination
configuration. See [dependency review](../security/m31-frontend-dependencies.md).

Tests were defined before behavior where practical. Rust dev-policy tests first
failed compilation for missing DevUi variants, then passed after the narrow change.
QA independently authored and reviewed contract/component/proxy/startup/integration
tests. The original fixed-port startup reservation/watchdog/remediation is retained.
Exact commands, final counts, initial harness findings, integration evidence and
limitations are in the [M3.1 implementation report](../M31_IMPLEMENTATION_REPORT.md).

Production --serve and --serve --fixture success retain Origin3000. Explicit
--serve --dev-ui and --serve --fixture success --dev-ui select only Origin5173.
Host stays exactly127.0.0.1:3000; no-Origin GET remains allowed; POST requires one
exact allowed Origin and application/json. Worker/cooldown/body limits are unchanged.
Vite accepts only127.0.0.1:5173, proxies only/api/v1/ to fixed3000, rewrites Host
and never Origin, and rejects forwarded authorities/upgrades before file/proxy work.
All other approved scenarios retain their existing semantics with the same suffix.

README records fixture-only startup and sequential gates. The shell displays
loading/disconnection, backend readiness separate from provider availability,
mode/scenario, persistent synthetic notice and opaque snapshot metadata. Initial
success fixtures have no observations until explicit refresh; the shell does not
add refresh controls or fabricate market values. Production asset serving, full
frontend workflows, browser/visual verification, Linux reproduction, hosted final
CI and adapter AC8/AC10 remain separate release evidence. Stop after M3.1 local
verification for Technical Lead review; do not mark this specification IMPLEMENTED.

## M3.1 publication checkpoint authorization (2026-10-19)

The Product Owner separately authorizes final verification, exactly one M3.1 commit
`feat: add react frontend foundation and secure dev proxy`, one normal non-force
push to origin/main and Actions verification for that exact published SHA. This
supersedes the implementation-only publication prohibition above for this checkpoint
only; no source correction, new dependency/feature, workflow modification, additional
commit/amend/rebase/force-push, provider request or deployment is authorized.

Three genuine agents completed read-only reviews with no material blocker. All four
Rust gates passed again with176tests, and local frontend typecheck/build/85tests,
focused actual-Vite15security tests and script-disabled unchanged-lock npm ci passed.
Fixture-only Rust/Vite/jsdom integration passed with owned-process cleanup. Node is
24.22.0, bundled npm11.19.1, Codex0.163.0; no reinstall or upgrade. Further checkpoint
review/evidence and limitations are in the M3.1 implementation report.

Existing hosted CI executes Rust gates only. React gates are local-only; browser
E2E/visual audit and deployment remain pending. The final checkpoint response records
published SHA, push and actual Actions outcomes after publication, without a second
commit. Independent Technical Lead source review, M3.1 human acceptance and full MVP
release remain separate. Specification remains APPROVED, not IMPLEMENTED.

## M3.2 approved local Market Dashboard scope (2026-10-19)

The Product Owner explicitly authorizes local market overview, manual refresh,
truthful Provider Health/freshness/errors, bounded deadlines, cooldown/duplicate
guards, single read-only timeout reconciliation, strict library checking,
deterministic tests and documentation. [Specification 0008](0008-market-dashboard.md)
records the plan and acceptance criteria; the
[M3.2 report](../M32_IMPLEMENTATION_REPORT.md) records executed evidence and limits.

Baseline HEAD/local origin/main is e1fe014336a0932e9d287c926873d24285eb83ff.
Three genuine subagents perform presentation, read-only backend verification,
and QA/security; the coordinator owns shared interfaces/state/client/integration.
Rust endpoint/security/fixture behavior remains unchanged. No new packages,
lock changes, CI changes, real provider requests, polling, portfolio UI, trading,
deployment, commit or push. Stop at local review. This supersedes earlier M3.2
future-scope wording only for this authorized slice. M3.2 is not accepted;
specification 0005 remains APPROVED, not IMPLEMENTED.

## M3.3 approved local Portfolio Calculator scope (2026-10-20)

The Product Owner explicitly authorizes local calculator implementation and
verification on clean main at HEAD/local origin/main
21e4b7b65f60e5ef5f99b45d1d5a1c500a375716. This supersedes older portfolio-UI
deferral for this bounded slice. [Specification 0009](0009-portfolio-calculator.md)
records the actual existing Rust valuation schema, acceptance criteria, component
interfaces, exclusive ownership and security controls before implementation.
[The M3.3 report](../M33_IMPLEMENTATION_REPORT.md) records exact file inventory,
genuine delegation, executed verification and limitations.

Explicit in-memory BTC/ETH inputs call the existing local Rust valuation endpoint;
React preserves exact quantities/USDT values/allocations as strings. Strict decoding,
bounded cancellation, edit/snapshot/freshness invalidation, missing/stale outcomes
and safe conflict/arithmetic errors are implemented. The actual success fixture
returns total11500.01200002 USDT and allocations56.52%/43.48%. All six fixture paths
also verify exact zero holdings and clean owned-process shutdown.

Final local gates pass: all four Cargo gates/176 tests, strict TypeScript checking
with skipLibCheck=false, production build and258 frontend tests (139 baseline plus
119 new). No Rust/API/lock/dependency/CI changes or installations. Browser visual/
screen-reader checks, Linux/hosted reproduction and fresh Rust advisory scan remain
unverified; the report retains historical operational limitations.

Optional opt-in quantity persistence remains a future MVP requirement, unimplemented
in M3.3. The roadmap separately proposes confirmed-observation presentation effects
and true streaming; no storage, streaming, animation, credentials, wallet or trading
capability is added. No live provider calls, commit, push or deployment. Stop at
local Technical Lead review. M3.3 acceptance and full MVP closure remain pending;
specification 0005 stays APPROVED, not IMPLEMENTED.
