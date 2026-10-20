# M3.3 local implementation report

Date: 2026-10-20. Status: locally implemented and verified; independent Technical
Lead review and Product Owner acceptance pending. No milestone closure or MVP
release is inferred. Specification 0005 remains APPROVED.

## 1. Starting and final Git boundary

Verified entry: clean main, empty index, no untracked files; HEAD and local
origin/main both `21e4b7b65f60e5ef5f99b45d1d5a1c500a375716`. Origin URL matches
the requested GitHub repository. These are local tracking-ref checks; no remote
fetch or new hosted CI result is claimed. The context snapshot had historical
M3.1/M3.2 statuses, superseded for current scope by the Product Owner's M3.3 request.

Final state: same branch/SHA, empty index, 11 modified and 13 created files listed
below, all local and unstaged/untracked. No unrelated local work existed or was
overwritten. No commit, push, deployment, package installation or CI change.

## 2. Specification and workflow

[Specification 0009](specs/0009-portfolio-calculator.md) documents the recovered
Rust contract, scope, acceptance criteria AC1–AC10, shared props, exclusive ownership,
security threats/controls and implementation plan before feature implementation.
The existing approved specification 0005 and accepted ADR 0003 govern the design;
no new architectural decision or Rust API amendment was required.

Workflow: SPEC → PLAN → TEST → IMPLEMENT → VERIFY → REVIEW; approval remains a
human checkpoint. QA defined deterministic cases before behavior where practical;
not every case was executed red first. Historical specifications/reports were
preserved; 0005 receives only an appended M3.3 evidence entry.

| Acceptance group | Executed evidence |
| --- | --- |
| AC1 quantity boundaries | portfolio-model: 30 deterministic tests |
| AC2 explicit actions/exact request | client, App interactions and real fixtures |
| AC3 golden values/allocations | all exact strings asserted through React → Vite → Rust success fixture |
| AC4 incomplete/stale/zero | decoder, App and all six actual fixture scenarios |
| AC5 strict runtime decoding | valuation-decode: 39 tests including negative combinations |
| AC6 bounded safe failures | valuation-client: 17 tests, App errors and existing shared-client regressions |
| AC7 races/currentness | Portfolio: 33 App cases including obsolete work and freshness/resume/unmount |
| AC8 accessibility/responsiveness | jsdom labels/linked errors/keyboard plus CSS/source inspection; browser visual/screen-reader evidence absent |
| AC9 required local gates | all four Cargo gates, strict frontend typecheck/build and 258 tests pass |
| AC10 integrity/docs/review boundary | graph/cache/npm advisory, unchanged locks/config/Rust, links/diff/ports checks; Rust advisory rescan unavailable |

## 3. Genuine delegation evidence

Exactly three real child agents were spawned with collaboration.spawn_agent;
no nested delegation or simulated agent roles. Shared interfaces/ownership were
documented before parallel implementation. Backend review started read-only while
the coordinator recovered the contract. Actual assignments:

| Agent | Exclusive work and evidence |
| --- | --- |
| /root/frontend | Four portfolio presentation components and styles.css; handed ownership back before coordinator corrections; later read-only integration review |
| /root/backend | Read-only Rust request/response, decimal/freshness/error/security review; later independently reviewed actual hook/App/API/decoder; no file writes or gates |
| /root/qa_security | frontend/tests/**; quantity/decoder/client/App tests, actual fixture integration, source-security assertions and independent review |
| /root coordinator | Specification/docs, App integration, contracts/client/decoder, portfolio-model and usePortfolio; final gates and actual diff/test review |

QA targeted runs reported 85 initial contract tests, 72 expanded App/decoder tests
and six fixture integrations passing. The coordinator independently ran the full
final 258-test suite. Heavy gates and fixed-port suites were serialized; Vitest
retains maxWorkers=2 and fileParallelism=false. No agent installed, committed or pushed.

## 4. Exact file inventory

Modified existing files (11):

- README.md
- docs/PORTFOLIO_ROADMAP.md
- docs/PROJECT_CONTEXT.md
- docs/specs/0005-freelance-portfolio-mvp.md
- frontend/src/App.tsx
- frontend/src/api/client.ts
- frontend/src/api/contracts.ts
- frontend/src/api/decode.ts
- frontend/src/styles.css
- frontend/tests/contracts/source-security.test.ts
- frontend/tests/proxy/integration.test.tsx

Created files (13):

- docs/specs/0009-portfolio-calculator.md
- docs/M33_IMPLEMENTATION_REPORT.md
- frontend/src/components/PortfolioCalculator.tsx
- frontend/src/components/HoldingsInput.tsx
- frontend/src/components/PortfolioSummary.tsx
- frontend/src/components/AssetValuationRow.tsx
- frontend/src/portfolio-model.ts
- frontend/src/usePortfolio.ts
- frontend/tests/components/Portfolio.test.tsx
- frontend/tests/contracts/portfolio-model.test.ts
- frontend/tests/contracts/valuation-client.test.ts
- frontend/tests/contracts/valuation-decode.test.ts
- frontend/tests/contracts/valuation-fixtures.ts

## 5. Components, API and quantity entry

App retains its existing dashboard/refresh/connectivity/provider-health state.
usePortfolio owns independent in-memory quantities, errors, request state, generation
token and accepted result. PortfolioCalculator renders the semantic form;
HoldingsInput renders controlled labelled text/decimal-input-mode fields;
PortfolioSummary renders total/history/state; AssetValuationRow renders supplied
quantity, price, value, allocation and incomplete reason. No global store or second
market fetch loop. No animation was added; existing M3.2 button hover CSS is unchanged.

Only an explicit Calculate action calls native fetch at `/api/v1/valuation` with
the latest usable validated snapshot ID and both original quantity strings.
The shared bounded client preserves omit credentials, no-store, redirect rejection,
JSON-only media and 32768-byte consumption cap. Browser Origin is not manufactured
by application code. The fixed Vite proxy and Rust security policy are unchanged.

UX validation accepts unsigned ASCII decimals, mandatory integer, optional nonempty
fraction, at most 32 characters/bytes and eight fractional digits, range 0..1000000
inclusive. Empty, signs, exponents, whitespace, Unicode digits and out-of-range text
produce associated field errors before POST. Bounded BigInt integer comparison
checks range; quantities remain text. Rust validates authoritatively. Input text
and focus are not overwritten by normalized returned quantities.

## 6. Runtime decoding and exact values

decodeValuation rejects unknown/missing/wrongly typed root/holding fields, unsupported
quote/state/rounding/estimate, malformed snapshot tokens, reordered/duplicate assets,
noncanonical decimals, out-of-bound coefficients/scales/quantities and unsupported
fixture annotations. Real valuations have no mode field; fixture mode requires
the exact existing notice, provenance and one of six scenarios.

Structural invariants cover complete/incomplete totals, reason/value/price
relationships, zero holdings and zero-total allocations. Monetary coefficients
are only bounded as integers; React never recomputes products, sums, allocation
or rounding. Values and server percentages remain exact strings.

The actual Rust success fixture displayed:

| Asset | Quantity | Price USDT | Value USDT | Allocation |
| --- | --- | --- | --- | --- |
| BTC | 0.1 | 65000.12 | 6500.012 | 56.52% |
| ETH | 2 | 2500.00000001 | 5000.00000002 | 43.48% |

Total: **11500.01200002 USDT**, unchanged through the real application path.

## 7. Snapshot consistency and failure behavior

Synchronous active-request guard prevents duplicate submissions. AbortController
and bounded object-identity generation tokens invalidate edits, refresh/read start,
accepted dashboard replacement even with unchanged ID, visibility changes, expiry
and unmount. Response acceptance additionally checks captured snapshot object/ID,
canonical submitted quantities, fixture mode/scenario and freshness at response-time
performance.now(), protecting against delayed display timers. Snapshot IDs are
equality tokens only. The existing display timer performs no I/O.

Currentness never returns merely because an obsolete HTTP response arrives late.
Retained values show Outdated estimate/historical notice, including when a safe
read accepts the same snapshot ID. Prior completion feedback also becomes outdated;
actionable error feedback survives context invalidation. No POST on typing, refresh,
timer, resume or reconciliation, and no automatic valuation retry.

Missing positive holdings show quote_missing with null value. Stale holdings show
quote_stale, preserving the supplied stale price but withholding its value. A young
observation can also be stale after an unsuccessful latest attempt; wording reflects
both causes. Partial usable values remain visible; total and allocations are absent.
Both zero holdings produce exact total 0 with null allocations even without quotes.
Unavailable quotes, API disconnection, invalid input and arithmetic limits have
separate explanations.

400 field errors, both 409 codes, both 422 codes and 503 stopping/overload/unavailable
are decoded through the existing safe-error allowlist. Conflict/503 invalidate
backend confirmation and expose the existing explicit Read backend state GET;
another explicit Calculate is required. 422 never substitutes zeros/rounding.
Malformed schema/JSON/UTF-8, wrong media, oversized body and network failures fail
closed without raw payloads/stacks. Explicit cancellation and unmount abort locally.

Valuation deadline: 35000ms including body reading, allowing Rust's 5s request read
plus 25s response budget and existing 30s Vite proxy limits. Existing GET10000ms and
refresh35000ms are unchanged. Deadline/cancellation bounds the client promise even
when a test transport ignores abort. Cancellation cannot undo already admitted
backend work; valuation performs no provider I/O or financial side effect.

## 8. Verification actually executed

Entry baseline reproduced with cargo test --locked --all-features (176 passed)
and npm test --prefix frontend (139 passed, seven files).

Final coordinator gates, run sequentially:

| Command | Result |
| --- | --- |
| cargo fmt --all -- --check | PASS |
| cargo clippy --locked --all-targets --all-features -- -D warnings | PASS |
| cargo build --locked --all-targets --all-features | PASS |
| cargo test --locked --all-features | PASS: 176 tests, zero failed/ignored |
| npm run typecheck --prefix frontend | PASS: both configs, skipLibCheck=false |
| npm run build --prefix frontend | PASS: 31 modules |
| npm test --prefix frontend | PASS: 11 files, 258 tests; original139 +119 new |

No separate frontend lint script exists; tsc/build/tests are the applicable gates.
Rust source/tests and arithmetic remain unchanged; no new Rust tests were needed
for this frontend integration. No unexecuted check is represented as passed.

## 9. Real fixture and accessibility/security evidence

The final complete suite runs actual React in jsdom → actual Vite → an owned Rust
fixture process for all six scenarios. It supplies browser Origin only in the
Node test bridge. Each scenario issues one initial GET, one explicit refresh POST
and two explicit valuation POSTs (positive quantities, then zeros). Assertions
check current snapshot IDs, original strings, decoded result and rendered values.

| Fixture | Positive holdings outcome | Both-zero outcome |
| --- | --- | --- |
| success | Exact golden total/asset values/allocations | Complete total0, null allocations |
| partial | BTC6500.012, ETH quote_missing; total/allocations null | Complete total0 |
| stale | Both quote_stale; prices retained, values/total/allocations null | Complete total0 |
| timeout | Both quote_missing; total/allocations null | Complete total0 |
| rate-limit | Both quote_missing, existing provider skip/cooldown preserved | Complete total0 |
| unavailable | Both quote_missing with existing503 provider outcomes | Complete total0 |

Tests retain bounded startup/request/cleanup waits, output caps, listener ownership
verification and owned-child cleanup. Post-cleanup test port binding and final
listener inspection confirm ports3000/5173 free. No live Binance calls.

Existing Vite15 Host/Origin/security tests pass inside the full suite, as do Rust
Host/Origin/CORS/body/worker/single-flight/cooldown regressions. Loopback3000/5173,
fixed target, preserved Origin, closed CORS, no WebSocket proxy and file protections
are unchanged. Source assertions cover no financial float conversion, persistence,
external destination, telemetry, HTML injection, streaming or new animation.

Accessible labels, field-specific aria-describedby alert nodes, status regions,
keyboard submission, cancellation and focus styles are inspected/tested. Scoped
CSS uses shrinkable grids and exact-decimal wrapping, two columns at1440/768 and
stacked layout at320. These are semantic/jsdom/CSS checks, not browser visual or
screen-reader proof. No Playwright/browser installation was attempted.

## 10. Dependency and advisory evidence

Checked Node24.22.0/npm11.19.1 and rustc/cargo1.99.0. No manifests, dependencies,
features, lockfiles, toolchains, proxy/config or CI files changed. No installation
or upgrade was performed. Existing license/native-source review remains applicable;
no new dependency surface was introduced.

- npm ls --all --prefix frontend: PASS; expected optional platform/browser peers absent.
- npm cache verify: PASS, 278 content entries/532622546 bytes verified.
- npm audit --package-lock-only --json --prefix frontend: PASS, zero vulnerabilities
  at all severities, 121 dependency entries at this point in time.
- cargo audit --version: unavailable (no such command); Rust advisories were not
  rescanned. No installation attempted, and historical scans are not new evidence.
- git diff confirms Cargo.lock/package-lock.json and manifests byte-unchanged.

Lock SHA256: Cargo.lock
`12eb0a572e454d6894c76a43eb61b2f1cbe05af21004533ee0f6b76749816331`;
frontend/package-lock.json
`939179b346b26e6fbcf7cde444785622a11fa66192d07d72bff1251885753580`.
Cache/graph/advisory checks do not exhaustively authenticate installed native code
or provide ongoing vulnerability assurance. No fresh Gitleaks scan is claimed.

## 11. Documentation, future work and review limits

README provides exact fixture startup, refresh, quantity/calculation and incomplete
demo instructions. The [roadmap](PORTFOLIO_ROADMAP.md) retains future opt-in quantity
persistence and separately proposes (A) presentation effects only on confirmed
observation changes and (B) true streaming requiring a new transport/rate/lifecycle
design. No fabricated ticks/direction/intermediate observations; no animation,
streaming or dependency is implemented here.

Documentation local links and git diff --check pass. Git reports existing configured
LF→CRLF normalization warnings only, not whitespace errors. Final working tree/index,
unchanged protected files and clean listener ports were inspected after gates.

Known limits: no actual browser/viewport/screen-reader visual audit; no Linux,
clean-checkout or hosted frontend reproduction; no fresh remote/hosted CI query;
no Rust advisory/secret rescans or OS-enforced network-denial proof; no live provider,
TLS availability or rate-limit evidence. Production static serving remains future
scope. Browser timers and OS scheduling are not hard real-time guarantees; the
existing operational/adapter acceptance gaps remain open. No holdings persistence,
streaming, animation, wallet or trading capability was added.

Ready for independent Technical Lead review of specification0009 and the actual
local diff, with these limits retained. Await human review/acceptance; do not mark
the milestone closed or specification IMPLEMENTED. No commit or push was made.
