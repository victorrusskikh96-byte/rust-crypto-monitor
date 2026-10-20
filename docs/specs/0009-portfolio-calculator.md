# M3.3 — Portfolio Calculator

Status: APPROVED scope by Product Owner; local implementation/verification authorized.
Independent Technical Lead review and human acceptance pending. Not IMPLEMENTED.
Baseline: main, HEAD/local origin/main 21e4b7b65f60e5ef5f99b45d1d5a1c500a375716;
clean index and working tree. No remote fetch implied.

## Scope and contract recovered before implementation

Extend the existing React application, accepted ADR 0003 and specification 0005.
No Rust, dependencies, CI, persistence, streaming, animation, trading, deployment
or publication changes. Only explicit local actions; no live provider verification.

POST /api/v1/valuation accepts exactly snapshot_id:string and quantities:{BTC:string,
ETH:string}. Use the latest validated dashboard identity as an opaque equality token.
Quantity syntax: unsigned ASCII integer with optional nonempty fraction; <=32 bytes,
<=8 fractional digits, 0..1000000 inclusive. Leading/trailing zeros are permitted
in input; Rust normalizes returned quantities. Preserve typed text in controlled inputs.

Response required fields: snapshot_id, quote:"USDT", state:"complete"|"incomplete",
holdings:[BTC,ETH], total:string|null, allocation_rounding:"independent_half_even_2dp",
estimate:true. Each holding has exactly asset, quantity, price:string|null,
value:string|null, allocation_pct:string|null, reason:null|"quote_missing"|"quote_stale".
Fixture responses additionally contain mode:"fixture", provenance:"fixture" and
fixture:{scenario,notice}, using the existing six scenarios and exact notice.
Real valuation responses have no mode field. Unknown/missing fields fail closed.
Canonical nonnegative decimals have <=28 fractional digits and a 96-bit coefficient;
quantity additionally has <=8 fractional digits and the input range. Allocations
are server-produced two-decimal percentages. Never recompute financial results.

Complete results have nonnull holding values/total and null reasons. Incomplete
results retain usable holding values but withhold total and both allocations.
Positive missing/stale holdings have null value and an explicit reason; stale price
may remain present. Zero holdings have value "0" and no reason even without quotes.
Zero total has null allocations. Rust remains authoritative for arithmetic.

400 invalid_request/invalid_quantity; 409 refresh_in_progress/snapshot_replaced;
422 arithmetic_capacity/unrepresentable_value; 503 stopping/overloaded/unavailable.
Reuse the strict allowlisted safe-error envelope and bounded JSON reader (32768 bytes).
Valuation deadline 35000ms permits existing 5s read +25s response processing, while
GET stays 10000ms and refresh stays 35000ms. No POST retry or automatic GET on conflict;
the existing explicit Read backend state action reconciles before another calculation.

## Interfaces and exclusive ownership

Coordinator: this specification/docs, App.tsx, api/{contracts,decode,client}.ts,
portfolio-model.ts and usePortfolio.ts. Backend agent: read-only contract/security review.
Frontend agent: components/{PortfolioCalculator,HoldingsInput,PortfolioSummary,
AssetValuationRow}.tsx and styles.css. QA agent: frontend/tests/** only. No nested
delegation or simultaneous heavy gates; max two Vitest workers, serial fixed ports.

Shared contracts: Quantities={BTC:string;ETH:string}; HoldingValuation and Valuation
mirror the response above. QuantityErrors=Partial<Record<'BTC'|'ETH',string>>.
PortfolioCalculator props: quantities, errors, busy:boolean, available:boolean,
message:string|null, result:Valuation|null, outdated:boolean, fixture:boolean,
onChange(asset:'BTC'|'ETH',value:string):void, onCalculate():void, onCancel():void.
Named exports. Inputs labelled "BTC quantity"/"ETH quantity", button "Calculate
portfolio", pending action "Cancel calculation". Portfolio section has heading
"Portfolio". Component owns presentation only; no fetching or arithmetic.

Coordinator owns in-memory input/edit generation independently of dashboard state.
Synchronous duplicate guard and AbortController bound requests; capture dashboard
object identity, snapshot ID, edit generation and local freshness state. Refresh/read
start, accepted dashboard replacement (even same ID), edits, visibility invalidation,
disconnect and quote expiry invalidate results and abort obsolete work. Responses
must match captured identities, quantities and fixture provenance. Historical results
may remain visibly Outdated; no obsolete response restores currentness. Local clocks
only estimate quote age; Rust rechecks at calculation. No independent market loop.

## Acceptance criteria and deterministic negative cases

- AC1: Empty inputs produce field errors; accept zero, 0.1, 2, eight fractional digits,
  32 ASCII bytes and 1000000. Reject signs, exponent, whitespace, Unicode, negatives,
  missing integer/fraction, >8 fractional digits, >32 bytes and >1000000.
- AC2: Exactly one explicit POST uses accepted snapshot and both unchanged input strings;
  duplicate clicks blocked; no keystroke/refresh/timer/resume automatic valuation.
- AC3: Actual success fixture returns/display BTC65000.12 /6500.012, ETH2500.00000001
  /5000.00000002, total11500.01200002 USDT, allocations56.52%/43.48% unchanged.
- AC4: Partial, stale, all missing and zero-without-quotes outcomes match Rust null/reason
  semantics. Never fabricate zero totals or allocations for positive incomplete holdings.
- AC5: Strict decoder rejects malformed, unknown, missing, wrongly typed, noncanonical,
  inconsistent complete/incomplete/zero and unsupported fixture/schema fields.
- AC6: 400/409 both/422 both/503, malformed JSON/media/oversize, network/deadline/cancel
  errors are sanitized and distinct; no retries. Conflict enables explicit safe GET.
- AC7: Edits, refresh/read start/accept, obsolete response, stale expiry, tab resume,
  disconnection and unmount cannot restore obsolete results; requests cancel safely.
- AC8: Semantic labels, linked field errors, keyboard submit, focus and text statuses;
  exact decimals wrap with responsive CSS for320/768/1440. Browser visual/screen-reader
  verification is reported separately from jsdom/CSS evidence.
- AC9: Existing176 Rust and139 frontend tests preserved; all four Cargo and frontend
  typecheck/build/test gates pass; real React->Vite->Rust offline success/partial/stale/
  zero integration, existing Host/Origin/proxy/security regressions pass.
- AC10: Locks/manifests/Rust/CI unchanged, no dependencies installed; graph/integrity/
  advisory evidence and limitations reported, documentation links/diff checked, owned
  subprocesses cleaned and ports3000/5173 free. Stop at local review, no commit/push.

## Security plan

Boundaries: typed untrusted quantity -> local JSON; untrusted API -> strict decoder ->
React text; async market/valuation state -> freshness/currentness claims. Controls:
ASCII bounded validation before POST, Rust authoritative validation/arithmetic, fixed
relative destination, omit credentials, reject redirects, exact Host/Origin proxy,
bounded deadline/body, safe allowlisted errors, generation/cancellation, provenance.
No HTML injection, telemetry or storage. Preserve worker admission/cooldown, no
provider calls from valuation. Review actual behavior independently with QA/backend.

## Plan and review checkpoint

Document contract/interfaces and acceptance cases; define deterministic tests; parallel
exclusive presentation and QA work while coordinator integrates API/state; serialize
complete gates, fixture tests and independent review; record exact evidence/limits.
Future opt-in quantity persistence and price-change presentation/true streaming stay
separate roadmap proposals and grant no implementation permission here.
