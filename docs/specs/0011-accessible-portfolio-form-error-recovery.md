# 0011 — Accessible portfolio form error recovery

## Status
APPROVED. The Product Owner authorized M3.4 B3 local implementation and verification on 2026-10-20. Independent Technical Lead review and human acceptance remain pending; this specification is not IMPLEMENTED.

## Problem
An explicit invalid portfolio submission displays field-specific errors but leaves focus on the submit control. Keyboard and pointer users must locate the first invalid quantity themselves before correcting it.

## Goals
- On an explicit invalid submission, focus the first invalid quantity in BTC-then-ETH order.
- Preserve entered text, existing field errors and associations, keyboard and pointer submission, and the single existing valuation path.
- Keep focus stable during typing, error clearing, rerenders, market changes, asynchronous responses, cancellation, and successful calculations.

## Non-goals
- Asynchronous focus management for server-side errors.
- Error summaries, visual redesign, persistence, automatic calculation, retries, market refresh changes, or B4 browser-harness work.
- Rust, API, exact-decimal, dependency, Vite, WebSocket, CI, deployment, or financial-capability changes.

## Functional requirements
1. Each explicit enabled form submission validates the current controlled BTC and ETH strings with the shared `quantityErrors()` rules.
2. If BTC is invalid, focus BTC; otherwise, if ETH is invalid, focus ETH. The both-invalid case therefore focuses BTC.
3. Focus occurs after field errors are rendered so the focused input exposes its current error through `aria-describedby`.
4. Invalid submission preserves both input strings, displays existing field-specific messages, sends no valuation POST, and does not retry.
5. A valid submission keeps the existing behavior: exactly one valuation POST for one explicit action, with no success-time focus change.
6. Focus recovery is triggered only by an explicit invalid keyboard or pointer submission. Edits, rerenders, market updates, quote expiry, unrelated or delayed responses, cancellation, and unmount do not trigger it.
7. Disabled or busy controls retain their existing inert behavior.

## Non-functional requirements
- Preserve semantic form structure, labels, `aria-invalid`, `aria-describedby`, field alerts, polite status feedback, visible focus styles, and decimal input mode without unnecessary ARIA.
- Use component-owned input refs and a bounded post-render focus request; do not use document selectors, timeouts, polling, duplicated validation logic, or a second valuation path.
- Preserve accepted M3.3 and M3.4 B1+B2 behavior and all exact decimal strings.

## Affected files
- `docs/specs/0011-accessible-portfolio-form-error-recovery.md` — approved B3 contract and verification plan.
- `frontend/src/components/HoldingsInput.tsx` — accept a component-owned input ref.
- `frontend/src/components/PortfolioCalculator.tsx` — validate explicit submissions, request and apply first-invalid focus after errors render.
- `frontend/tests/components/Portfolio.test.tsx` — replace deferred behavior and add B3 regression coverage.
- A concise local implementation report under `docs/` after verification.

## Acceptance criteria
- **AC1:** Empty BTC and ETH focuses BTC, preserves both strings, exposes both associated errors, and sends zero valuation POSTs.
- **AC2:** Invalid BTC with valid ETH focuses BTC; valid BTC with invalid ETH focuses ETH; original strings remain unchanged.
- **AC3:** Both keyboard Enter and pointer click invoke identical first-invalid focus recovery.
- **AC4:** Correcting a field clears its error without moving focus; ordinary rerenders do not change focus.
- **AC5:** A valid explicit submission sends exactly one POST and neither submission nor success steals focus.
- **AC6:** Busy/disabled state causes no extra request, focus movement, retry, or calculation path.
- **AC7:** Existing error labels and descriptions, focus outline, keyboard semantics, input mode, status messages, race/cancellation/snapshot/stale behavior, exact values, and six fixture integrations remain intact.
- **AC8:** The four required Cargo gates, frontend typecheck/build/full tests, 15 Vite security tests, six real fixture integrations, and `git diff --check` pass. Browser checks cover desktop and narrow mobile using installed Chrome/CDP if available.
- **AC9:** Rust, API/contracts, dependencies/locks, Vite/WebSocket configuration, CI, and Git history are unchanged; no live service, commit, push, publication, or deployment occurs.

## Verification plan
1. Replace the deferred B3 test and add deterministic React Testing Library cases for the focus matrix, keyboard and pointer parity, preserved strings/associations, correction/rerender stability, valid single POST, and busy/disabled behavior.
2. Run the focused component test before and after implementation.
3. Run sequentially: `cargo fmt --all -- --check`, `cargo clippy --locked --all-targets --all-features -- -D warnings`, `cargo build --locked --all-targets --all-features`, and `cargo test --locked --all-features`.
4. Run `npm run typecheck --prefix frontend`, `npm run build --prefix frontend`, and `npm test --prefix frontend`, with expensive/fixed-port integration work serialized.
5. If the existing installed Chrome/CDP path is available, use only the success offline fixture at a narrow mobile and desktop viewport to inspect active element, focus visibility, error association, correction stability, exact valuation, and request counts. Otherwise report the limitation without installing tools.
6. Review the complete diff, changed-file scope, protected boundaries, `git diff --check`, and final Git state. Record results in the local B3 report and stop for independent Technical Lead review.

## Security review
The existing boundary remains untrusted in-memory text → shared bounded ASCII quantity validation → explicit local valuation POST. B3 adds no side effect before validation and no endpoint, credential, storage, HTML injection, dependency, privilege, provider, wallet, transaction, or arithmetic behavior. Invalid input remains fail-closed with zero valuation POSTs. Component refs are scoped to the two owned inputs; delayed server errors intentionally do not move focus and cannot override a user’s resumed context.

## Dependencies and risks
- Depends on approved specifications 0009 and 0010 and their existing contracts.
- A focus effect could replay on unrelated renders; a one-shot submission token cleared immediately after use mitigates that risk, with explicit stability tests.
- Focusing before errors commit could hide the description from assistive technology; post-render focus and association assertions mitigate that risk.
- jsdom cannot prove visible focus rendering or real screen-reader speech; installed-browser inspection covers visible focus where available, while screen-reader speech remains a reported limitation.

## Open decisions
None. The Product Owner authorization fixes the B3 scope and first-invalid ordering.
