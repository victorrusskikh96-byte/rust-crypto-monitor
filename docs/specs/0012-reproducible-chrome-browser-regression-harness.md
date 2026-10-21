# 0012 — Reproducible Chrome browser regression harness

## Status
APPROVED. The Product Owner authorized M3.4 B4 local implementation and verification on 2026-10-21. Independent Technical Lead review and human acceptance remain pending; this specification is not IMPLEMENTED.

## Goal
Provide a small real-browser regression harness for the existing synthetic dashboard using Node.js 24 built-ins, the installed Chrome, native Chrome DevTools Protocol (CDP), the existing Rust fixture binary, and the existing Vite development server.

## Scope and boundaries
- Add browser automation only under `frontend/tests/browser/`, one `test:browser` npm script, this specification, concise README instructions, and a local implementation report.
- Preserve all production React/CSS, Rust, API, financial arithmetic, dependency/lockfile, Vite security, WebSocket, CI, and deployment behavior.
- Use only synthetic fixture modes. No live Binance request, credential, wallet, transaction, external asset, telemetry, persistence, streaming, or price animation is permitted.
- The harness is local verification and is not added to hosted CI.

## Harness responsibilities
1. Refuse to start unless fixed application ports 3000 and 5173 are free.
2. Launch direct, owned Rust fixture, Vite, and Chrome processes; never kill an unrelated process.
3. Use an isolated temporary Chrome profile, loopback-only debugging, and Chrome's ephemeral CDP port.
4. Enable Runtime, Page, Network, Log, and Fetch domains before navigation. Permit ordinary page/asset GET traffic only through `http://127.0.0.1:5173`; permit only `GET /api/v1/dashboard`, `POST /api/v1/refresh`, and `POST /api/v1/valuation` through that Vite origin. Before transport, abort and record direct browser requests to port 3000, external destinations, unexpected API paths or methods, and other unapproved transport. Inert `about:blank`, `data:`, and `blob:` handling introduces no transport. Treat the loopback CDP connection separately.
5. Count API requests from Network events, use Fetch interception only for allow/block decisions, capture runtime exceptions, and bound process output.
6. Drive pointer and keyboard behavior with CDP input commands. DOM evaluation may locate and assert state but may not synthesize application events or recalculate financial values.
7. Use bounded readiness, polling, scenario, and overall deadlines. No market-operation retry or silent scenario skip is allowed.
8. On success, failure, or interruption, close targets and owned processes, delete the isolated profile, and verify the application/CDP listeners are closed.

## Scenarios
- **Success:** at 320, 375, 768, 1024, and 1440 by 1000, run a fresh success fixture, make exactly one manual refresh, assert exact rendered prices/values/total/allocations, then assert a both-zero total of exactly 0 with unavailable allocations.
- **Invalid form:** in a real success page, cover empty/both-invalid ordering, each single-invalid branch, pointer and Enter submission, error associations, preserved focus on correction, zero invalid valuation POSTs, and exactly one valid valuation POST.
- **Other fixtures:** serially run partial, stale, timeout, rate-limit, and unavailable. Assert scenario-specific messages, synthetic labeling, incomplete totals/allocations, and no automatic refresh/retry.
- **Responsive/accessibility smoke:** at every success width assert document order, no horizontal page overflow, visible/unclipped financial strings, visible focus outline, usable labeled fields/buttons, and no runtime exception. These geometry assertions do not establish visual equivalence or WCAG conformance.
- **Intentional failure:** an explicit internal CLI flag fails deterministically after process/browser readiness. It must exit nonzero through the normal cleanup path and leave no listeners.

## Process and network safety
- Run only one fixture environment at a time on shared ports.
- Rust and Vite listen only on their existing fixed loopback ports. Chrome debugging binds to loopback on an OS-selected port read from its isolated profile.
- Chrome background networking is reduced with local test-profile flags, without disabling browser security. Page Fetch interception uses one reusable fail-closed policy for real interception and deterministic policy tests; it blocks direct backend, external, and unapproved API traffic before continuation. Local Vite development-client WebSocket rejection may be reported as a known local development observation; no other failed request is ignored.
- Child output, CDP messages used for diagnostics, screenshots, and temporary paths are bounded. Diagnostics must not expose secrets or raw upstream payloads.

## Timeouts and cleanup
- Each readiness operation has a short explicit deadline; each scenario has a bounded deadline; the whole run has an overall deadline.
- Polling uses deterministic conditions with short bounded intervals rather than arbitrary long sleeps.
- Cleanup lives in `finally` paths and interrupt handlers. It first requests graceful browser/process shutdown, then applies bounded termination only to recorded owned PIDs/trees when necessary.
- Listener cleanup for 3000, 5173, and the selected CDP port is verified. An OS policy that prevents cleanup is reported as a failure; it is not bypassed.

## Acceptance criteria
- **AC1:** `npm run test:browser --prefix frontend` gives readable per-scenario PASS/FAIL output and a nonzero exit on any failure.
- **AC2:** All six actual Rust fixtures execute serially; the five specified widths execute the success flow with screenshots outside the repository.
- **AC3:** Success renders the exact approved strings `65000.12`, `2500.00000001`, `6500.012`, `5000.00000002`, `11500.01200002 USDT`, `56.52%`, and `43.48%`; both-zero renders total `0` and unavailable allocations. JavaScript does not recalculate these values.
- **AC4:** Real CDP keyboard/pointer tests prove B3 focus recovery, associated errors, stable correction focus, zero invalid valuation POSTs, and one valid valuation POST.
- **AC5:** Other fixtures show honest missing/stale/failure outcomes, no unsupported total or fabricated allocation, persistent synthetic warnings, and no automatic refresh retry.
- **AC6:** The shared Fetch authorization policy deterministically rejects direct backend requests, external URLs, wrong API methods, and unknown API routes before continuation; focused tests invoke that same policy without sending external traffic. Network events independently prove expected request counts. No live provider request occurs.
- **AC7:** Startup, output, polling, scenarios, and the overall run are bounded. Success, failure, and interrupt cleanup own only launched processes and leave no 3000/5173/CDP listener or Chrome profile.
- **AC8:** The intentional-failure mode exits nonzero after readiness and cleanup verification succeeds. A deterministic combined-failure control proves that the primary failure and every cleanup failure remain visible, sanitized, and bounded, with a nonzero exit.
- **AC9:** Existing four Rust gates pass with 176 tests; frontend typecheck/build/full Vitest pass with at least 269 tests, including 15 Vite security tests and six fixture integrations; `git diff --check` passes.
- **AC10:** No dependency, lockfile, Rust/backend, production React/CSS, API contract, Vite, WebSocket, CI, or unrelated file changes occur. No commit, push, deployment, or B5 work occurs.

## Evidence limits
Local Windows and installed-Chrome execution can verify only the tested browser/version, fixture paths, widths, DOM/accessibility properties, network observations, and cleanup. Linux/macOS, screen-reader speech, native mobile/touch, forced colors, zoom behavior, visual equivalence, WCAG conformance, production serving, and production readiness remain NOT VERIFIED.
