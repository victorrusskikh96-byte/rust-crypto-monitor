# M3.2 — Market Dashboard and Provider Health

Status: APPROVED local scope by the Product Owner request on 2026-10-19.
Local implementation and required gates verified; Technical Lead review pending.
This does not accept M3.2 or complete specification 0005.
Baseline: main HEAD and local origin/main e1fe014336a0932e9d287c926873d24285eb83ff, clean tree.

## Contract and scope
Extend the accepted React architecture only. Rust remains unchanged. Exactly BTC/USDT
and ETH/USDT; exact monetary strings, USDT, no financial conversions or fabricated
charts/movement. Accepted specification 0005 and current src/http/mod.rs and worker.rs behavior are authoritative; existing schema-1 dashboard and error decoders validate that contract. POST /api/v1/refresh sends {} with JSON;
only explicit user action can issue POST. No browser-set Origin; preserve Vite policy.
200 contains independent provider outcomes; 409 busy, 429 admission cooldown, 503
worker/overload/stopping, 504 detached waiter. A provider 429 inside 200 is distinct.

## State and transitions
Store connectivity, last accepted timed snapshot, operation/pending, error feedback,
cooldown and uncertain-worker status separately. One operation ref synchronously
blocks duplicates. Generation plus AbortController suppress obsolete requests and
unmount updates. Initial GET may be superseded by explicit refresh; an old GET never
overwrites it. Preserve previous quotes with previous/stale labels during operations,
disconnect, invalid responses and resume. HTTP readiness never asserts provider health.
Display per-market observation and attempt, safe error, last successful observation,
source and synthetic timestamp labels. BTC rate limiting stops remaining ETH calls:
do not invent ETH attempts or erase its prior attempt history.

A 504 or client refresh deadline performs exactly one bounded reconciliation GET,
never another POST. If still busy, disconnected, malformed or uncertain, block refresh
and offer explicit Read backend state GET; no recursive or periodic reconciliation.
409 and uncertain network/invalid POST outcomes also offer that safe read action.
A 503 blocks refresh pending a safe read; stopping/failed snapshots remain disabled.
429 updates cooldown from the greater validated retry_after_ms and integer Retry-After.
After a completed response, use refresh_allowed_in_ms. Countdown expiry only enables
a later explicit action; backend admission remains authoritative.

## Time and bounds
GET deadline 10,000ms; POST 35,000ms including fetch and bounded body decoding.
Rust allows 5s reading plus 25s response; Vite has fixed 30s proxy budgets. POST's
35s allows the server/proxy processing window, not an early false timeout. Client
cancellation detaches only its browser waiter and does not cancel backend work.
Response media type/32KiB limit/strict runtime decoding remain enforced.
Use performance.now monotonic elapsed and BigInt for integer time metadata; never
wall time for freshness. Conservatively include request transit in quote age, anchor
cooldown after receipt. Fresh only when backend success and estimated age <=60000ms;
60001ms is stale. Schedule bounded local display ticks at most once per second plus
the exact TTL boundary; stop timers when no display transition remains or hidden.
On tab resume mark the snapshot previous/stale until an explicit read or refresh;
do not fetch. Fixture Unix-ms labels are synthetic receipt metadata, not trades.

## Ownership and shared interfaces
No parallel edits before this interface agreement. No nested delegation.
Coordinator: App.tsx, api/client.ts, api/decode.ts as needed, dashboard-model.ts,
both tsconfigs, ConnectionStatus.tsx, specification/docs, integration/gates.
Frontend agent: new MarketOverview.tsx, MarketCard.tsx, ProviderHealth.tsx,
RefreshControl.tsx and styles.css ONLY. No API or App changes.
QA agent: frontend/tests/** ONLY. Backend agent: read-only source/contract/security review.
Coordinator-owned dashboard-model.ts exports MarketView:
{ market: Market; stateLabel: string; ageLabel: string; previous: boolean }.
MarketOverview props: { markets: readonly MarketView[]; pending: boolean }.
MarketCard props: { view: MarketView }.
ProviderHealth props: { dashboard: Dashboard; snapshotCurrent: boolean; pending: boolean;
serviceMessage: string | null }.
RefreshControl props: { disabled: boolean; pending: boolean; reconciling: boolean;
cooldownSeconds: string | null; message: string; onRefresh: () => void;
onReconcile?: (() => void) | undefined }.
Named exports. Refresh accessible name "Refresh markets"; safe GET action
"Read backend state". Provider Health and Market Overview headings. No live regions
on age countdown; one operation feedback status. Existing ConnectionStatus/ModeNotice reused.

## Deterministic acceptance criteria
- AC1: Initial fixture GET contains no prices, two unavailable cards, no POST; mode persists.
- AC2: One explicit refresh => one fixed POST {}, synchronous duplicate guard; accessible button.
- AC3: Two/partial/no successful provider results, timeouts, 503, rate limit and untouched ETH
  render truthful independent safe outcomes; retain stale prior observations and exact decimals.
- AC4: <=60000ms/60001ms, failure after success, long inactive resume and API loss never falsely
  label previous data current; fixture timestamps/provenance remain synthetic.
- AC5: 409/429/503/stopping/failed, cooldown changes and expiry covered without automatic POST.
- AC6: 504/client deadlines => at most one GET, no POST retry; failed reconciliation remains
  uncertain; bounded body/fetch waiting, ordinary abort, unmount and obsolete GET tested.
- AC7: No polling/provider URLs/credentials/financial arithmetic; negative schema/media/body
  cases fail closed without raw payloads.
- AC8: Semantic responsive CSS at 320/768/1440, text indicators, focus, exact long-price wrapping;
  structure/CSS assertions are not browser visual proof.
- AC9: Both skipLibCheck false; Rust four gates/at least176 tests; frontend typecheck/build/tests,
  existing proxy security and fixture React->Vite->Rust smoke; <=2 Vitest workers, heavy work
  and fixed ports serialized; owned processes only, bounded startup/cleanup.
- AC10: Dependency graph/integrity/advisory checks, unchanged lock and no package changes;
  documentation reports executed evidence and limitations; stop at Technical Lead review.

## Security review plan
Affected boundaries: untrusted API JSON -> presentation and user action -> refresh worker.
Threats: stale claims, duplicate admission, response races, unbounded wait/body, raw errors,
fixture provenance loss. Controls: strict decoder, exact strings, operation/generation guards,
deadlines/cancellation, conservative freshness and sanitized messages. Preserve loopback,
exact Host, mutually exclusive Origin, fixed proxy, no CORS/WebSockets/secret-file exposure,
worker/resource/rate policy. No new dependencies, Rust/CI changes, live calls, portfolios,
credentials, trading, commits, push or deployment.

## Local verification result
Coordinator final gates passed: four Rust gates/176 tests; both strict TypeScript
configurations with skipLibCheck=false; frontend production build;139 tests across
seven files, including six actual fixture integrations and existing Vite security.
Script-disabled locked npm ci, graph/cache/advisory checks passed; lock unchanged.
See [the implementation report](../M32_IMPLEMENTATION_REPORT.md) for exact commands,
file inventory, genuine agent evidence, source-review findings and limits.
This is locally verified work awaiting independent Technical Lead review, not acceptance.
