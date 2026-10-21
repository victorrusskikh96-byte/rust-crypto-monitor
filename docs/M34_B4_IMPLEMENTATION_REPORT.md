# M3.4 B4 local implementation report

Date: 2026-10-21

Scope: Reproducible Chrome Browser Regression Harness

Status: Local implementation and verification complete; Technical Lead fix re-review and human acceptance pending. M3.4 and B5 remain incomplete.

## 1. Baseline and scope

**VERIFIED:** work began on clean `main` at `efb765b253290c0d6e187534a6f31557a66e644f`, with local `origin/main` at the same commit and origin `https://github.com/victorrusskikh96-byte/rust-crypto-monitor.git`.

The B4 patch adds specification 0012, one dependency-free Node/CDP harness, one npm script, README instructions, and this report. It changes no Rust/backend, production React/CSS, API contract, Vite/WebSocket configuration, dependency/lockfile, CI, financial behavior, or deployment file. No package or browser was installed. No live Binance request, commit, push, or B5 work occurred.

## 2. Files

Modified:

- `README.md`
- `frontend/package.json`

Created:

- `docs/specs/0012-reproducible-chrome-browser-regression-harness.md`
- `frontend/tests/browser/run.mjs`
- `docs/M34_B4_IMPLEMENTATION_REPORT.md`

## 3. Harness design

**SOURCE-REVIEWED:** `npm run test:browser --prefix frontend` invokes one obvious `.mjs` entry point using Node.js built-ins and native CDP. It refuses occupied 3000/5173 ports, starts direct owned Rust fixture/Vite/Chrome processes, uses an isolated profile and Chrome-selected loopback CDP port, serializes fixtures, bounds output/readiness/commands/scenarios/the overall run, and never retries a market operation.

Before page navigation the harness installs Runtime, Page, Network, Log, and Fetch handling. One reusable authorization function is called by both Fetch interception and focused deterministic policy tests. It permits inert `about:blank`, `data:`, and `blob:` handling; ordinary frontend GET traffic only at `http://127.0.0.1:5173`; and only `GET /api/v1/dashboard`, `POST /api/v1/refresh`, and `POST /api/v1/valuation` through that Vite origin. Direct browser requests to port 3000, external destinations, wrong API methods, unknown API routes, API queries, and other frontend methods are blocked and recorded before continuation. Network events independently enforce exact API paths/methods/counts and forbid direct browser bypass of Vite. The known local Vite development-client WebSocket must remain rejected: a 101 response or any frame fails the suite. Runtime exceptions, unexpected console errors, blocked attempts, unexpected failed requests, and application WebSockets fail the scenario.

Final error reporting retains the primary scenario error and every cleanup error as separate bounded, path-sanitized diagnostics. Either category produces exit code 1; cleanup errors no longer disappear when a primary failure already exists.

CDP mouse coordinates, key events, and `Input.insertText` drive the UI. DOM evaluation is used only for location and assertions; it does not dispatch synthetic application events or calculate financial results.

On Windows, process trees are recorded by PID, executable path, and creation timestamp. Cleanup verifies the root identity before refreshing the tree, asks Chrome to close, reaps only matching recorded identities if necessary, removes the isolated profile, and verifies 3000/5173/CDP listeners are gone. An already-exited root never causes descendant discovery from a stale PID.

## 4. Browser results

**VERIFIED** on Microsoft Windows 10 Pro 10.0.19045, Node.js 24.22.0, npm 11.19.1, and installed Chrome 155.0.8059.85.

The final successful command was:

```powershell
npm run test:browser --prefix frontend
```

It passed:

- Success fixture at 320, 375, 768, 1024, and 1440 × 1000.
- Invalid form pointer and keyboard scenarios.
- Partial, stale, timeout, rate-limit, and unavailable fixtures.
- Final owned-process tree, profile, and 3000/5173/ephemeral-CDP cleanup.

Final screenshots are outside the repository at:

- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b4-Vau912\success-320x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b4-Vau912\success-375x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b4-Vau912\success-768x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b4-Vau912\success-1024x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b4-Vau912\success-1440x1000.png`

At every width the suite verified no horizontal page overflow, visible/unclipped exact financial strings, Refresh before Market Overview, both labeled decimal fields, Refresh/Calculate visibility and names, readable form/result regions, visible focused-field outline, and no runtime exception. This is geometry and interaction evidence, not visual equivalence or accessibility conformance.

## 5. Exact values and form behavior

**VERIFIED:** each fresh success fixture made one initial dashboard GET and one explicit refresh POST. Asset-scoped browser assertions confirmed:

| UI scope | Exact rendering |
| --- | --- |
| BTC market / holding | `65000.12`, `6500.012`, `56.52%` |
| ETH market / holding | `2500.00000001`, `5000.00000002`, `43.48%` |
| Portfolio total | `11500.01200002` `USDT` |

The harness reads these rendered strings and never recalculates them. A second explicit valuation with BTC/ETH both `0` returned exact total `0` and two unavailable allocations.

**VERIFIED:** empty fields focus BTC and expose both exact field-owned messages; invalid BTC/valid ETH focuses BTC; valid BTC/invalid ETH focuses ETH; pointer and Enter submission paths are independent; correction clears the error without moving focus; invalid cases send zero valuation POSTs; a valid Enter submission sends exactly one valuation POST and preserves the submitting field focus.

## 6. Other fixtures and network evidence

**VERIFIED:** every non-success fixture used the actual Rust synthetic fixture and exactly one explicit refresh. Partial mapped BTC price/value to BTC and ETH timeout/missing quote to ETH. Stale proved both market cards and both holding rows stale. Timeout proved both failures/missing quotes. Rate-limit proved BTC rate limiting, ETH not attempted, both positive holdings missing quotes, and no automatic retry. Unavailable proved both 503 outcomes and both missing quotes. Every incomplete result withheld the total and both allocations, and synthetic warnings remained visible.

**VERIFIED:** Network events observed only expected loopback application traffic, with dashboard `GET`, refresh `POST`, and valuation `POST` methods enforced. No direct browser request to port 3000, external page request, unexpected failed request, runtime exception, or successful application WebSocket occurred. Fetch blocking was enabled before navigation; the CDP loopback connection was tracked separately. The known Vite development-client WebSocket attempt was rejected and produced no frames. No live provider request occurred.

The focused command `node tests/browser/run.mjs --focused-tests` called the same authorization function as real Fetch interception and passed eight allowed plus ten blocked cases. The blocked cases included a direct port-3000 request, an external HTTPS URL, three wrong API methods, an API query, two unknown API routes, a noncanonical loopback host, and a frontend POST. This was a pure policy check: no request was sent.

## 7. Reliability controls

The deterministic negative command:

```powershell
Set-Location frontend
node tests/browser/run.mjs --intentional-failure
```

**VERIFIED:** it reached browser/fixture readiness, printed `FAIL primary: intentional failure control after browser and fixture readiness`, exited 1, and first reported successful process-tree/listener/profile cleanup. The earlier B4 real Ctrl+C control printed `FAIL interrupted by SIGINT`, exited 1, and reported the same cleanup success; that already-reviewed control was not repeated for these two fixes. Independent listener checks found no 3000, 5173, or reported CDP listener after the controls. Cleanup selection was limited to the harness-recorded PID, executable path, and creation timestamp identities; unrelated Chrome processes were outside that target set.

The deterministic `node tests/browser/run.mjs --combined-failure-control` exited 1 and printed both `FAIL primary: <repo> intentional primary failure control` and `FAIL cleanup 1: <temp> intentional cleanup failure control`. The focused reporting test additionally retained one primary and two cleanup errors and checked path sanitization and diagnostic bounds.

One intermediate full-suite repeat failed closed during initial navigation on an unclassified Chrome `net::ERR_ABORTED`; cleanup passed and left no listener. The failure diagnostic was improved to include bounded request method, URL, resource type, and canceled state without adding an ignore. The event did not recur in the subsequent complete passing run, so its cause remains **NOT VERIFIED** and no automatic retry was added.

## 8. Required verification

All commands below actually ran from the repository root unless shown otherwise:

| Command | Result |
| --- | --- |
| `cargo fmt --all -- --check` | PASS |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| `cargo build --locked --all-targets --all-features` | PASS |
| `cargo test --locked --all-features` | PASS — 176 passed, 0 failed |
| `npm run typecheck --prefix frontend` | PASS — both strict TypeScript projects |
| `npm run build --prefix frontend` | PASS — Vite production build |
| `npm test --prefix frontend` | PASS — 269 passed in 12 files |
| `npm test --prefix frontend -- tests/proxy/vite.test.ts` | PASS — 15 passed |
| `npm test --prefix frontend -- tests/proxy/integration.test.tsx` | PASS — six fixture scenarios passed |
| `npm run test:browser --prefix frontend` | PASS — separate real-Chrome suite described above |
| `node tests/browser/run.mjs --focused-tests` (from `frontend`) | PASS — 8 allowed/10 blocked policy cases and combined diagnostic assertions; no request sent |
| `node tests/browser/run.mjs --combined-failure-control` (from `frontend`) | EXPECTED FAIL — exit 1 with primary and cleanup diagnostics both visible and sanitized |
| `node tests/browser/run.mjs --intentional-failure` (from `frontend`) | EXPECTED FAIL — exit 1 after readiness; cleanup passed |
| `node --check frontend/tests/browser/run.mjs` | PASS |
| `git diff --check` | PASS; informational LF→CRLF checkout warning for `frontend/package.json` |

No dependency/advisory scan was rerun because dependencies and lockfiles did not change. The browser suite is separate from the 269 Vitest tests.

## 9. Evidence classification and limits

- **VERIFIED:** the executed Windows/Chrome results, exact request/value/focus assertions, shared policy controls, preserved combined failure diagnostics, deterministic post-readiness failure, real SIGINT, and final listener/profile cleanup above.
- **SOURCE-REVIEWED:** fail-closed handling for Chrome absence, occupied ports, spawn errors, bounded process output, startup/command/scenario/overall deadlines, and identity-checked tree cleanup branches not otherwise forced during the successful run.
- **NOT VERIFIED:** the cause of the one non-reproduced initial-navigation `net::ERR_ABORTED`; Linux/macOS, other Chrome versions, headed mode, physical touch/native mobile browsers, screen-reader speech, browser zoom, forced colors, full visual equivalence, WCAG conformance, OS-level egress denial, production asset serving, hosted CI for this browser suite, and production readiness.

No unresolved application defect was found. The non-reproduced Chrome abort above remains a harness reliability observation for Technical Lead review. Technical Lead re-review and Product Owner acceptance remain required; specification 0012 remains APPROVED, not IMPLEMENTED.
