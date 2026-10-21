# M3.4 B3 local implementation report

Date: 2026-10-20

Scope: Accessible Portfolio Form Error Recovery

Status: Local implementation and verification complete; independent Technical Lead review and human acceptance pending. M3.4 is not complete.

## 1. Starting state

- Repository: `C:\Projects\rust-crypto-monitor`
- Branch: `main`
- `HEAD`: `e0916a9be36d9980762eb0f7ce8852470f7917e0`
- Local `origin/main`: `e0916a9be36d9980762eb0f7ce8852470f7917e0`
- Index and working tree: clean before B3 work
- No remote fetch was performed; remote freshness beyond the local tracking ref is not claimed.

## 2. Specification and acceptance

Created `docs/specs/0011-accessible-portfolio-form-error-recovery.md`. It specifies first-invalid focus on explicit submission, BTC-before-ETH ordering, post-error-render focus, preserved input text and associations, no invalid POST/retry, no asynchronous focus, valid single-POST behavior, keyboard/pointer parity, and unchanged security/financial boundaries. The specification remains `APPROVED`, not `IMPLEMENTED`, until human acceptance.

## 3. Files created and modified

Created:

- `docs/specs/0011-accessible-portfolio-form-error-recovery.md`
- `docs/M34_B3_IMPLEMENTATION_REPORT.md`

Modified:

- `frontend/src/components/HoldingsInput.tsx`
- `frontend/src/components/PortfolioCalculator.tsx`
- `frontend/tests/components/Portfolio.test.tsx`

No other repository file changed.

## 4. Focus implementation

`PortfolioCalculator` owns refs for the existing BTC and ETH inputs. Its existing form-submit path reuses `quantityErrors(quantities)` to choose BTC first, otherwise ETH, and then calls the unchanged `onCalculate()` contract. `usePortfolio` remains the owner of quantity state, validation errors, and the only valuation request path.

A one-shot ref records the invalid asset only during an explicit enabled submission. A layout effect waits for the existing error state to render, clears the one-shot request, and focuses the corresponding component ref. No selector, timeout, polling, additional state library, effect chain, second valuation path, or asynchronous-response focus behavior was added.

## 5. Invalid-case behavior

- BTC invalid, including both-invalid: BTC receives focus.
- BTC valid and ETH invalid: ETH receives focus.
- Only BTC invalid: BTC receives focus.
- Original controlled strings and existing field-specific messages remain unchanged.
- Invalid submissions produce zero valuation POSTs and no retry.
- Correcting an input clears that field error without moving focus. Rerenders, market/state invalidation, successful responses, cancellation, and delayed server-side errors have no pending focus request.

## 6. Keyboard and pointer verification

React tests exercise invalid Enter and click submission, each single-invalid branch, both-invalid ordering, correction/rerender stability, disabled state, and busy/success focus stability. Valid submission still produces exactly one valuation POST.

Installed Chrome `155.0.8059.85` was driven through CDP using only the real success offline fixture and temporary evidence outside the repository:

- 320×1000 pointer submission with BTC `-1`, ETH `2`: active element `portfolio-btc`; zero valuation POSTs.
- 1440×1000 Enter submission with both fields empty: active element `portfolio-btc`; zero valuation POSTs.
- Correction to BTC `0.1`: BTC remained focused and `aria-invalid` cleared.
- Valid BTC `0.1`, ETH `2`: exactly one valuation POST and exact Rust valuation displayed.

Temporary screenshots:

- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b3-verification\pointer-invalid-320x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b3-verification\keyboard-invalid-1440x1000.png`

The owned Rust fixture, Vite, and Chrome processes were stopped after the run. No browser package, driver, Playwright dependency, or repository harness was added.

## 7. Accessibility findings

Labels, text inputs, decimal input mode, semantic form submission, `aria-invalid`, `aria-describedby`, field alerts, polite status feedback, and existing CSS focus treatment are preserved. In Chrome at both widths the focused control had a visible 2px solid `rgb(156, 225, 180)` outline. The accessibility tree exposed role `textbox`, name `BTC quantity`, focused and invalid states, `describedby` references to both hint and error, and a description containing the current field error. No extra ARIA role or duplicate error region was added.

This is evidence for the tested Chrome accessibility tree and visible focus only. No screen-reader speech, forced-colors, browser zoom, native mobile browser, or physical touch test was performed, and no WCAG conformance claim is made.

## 8. Verification results

All commands ran from the repository root and passed:

| Command | Result |
| --- | --- |
| `cargo fmt --all -- --check` | PASS |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| `cargo build --locked --all-targets --all-features` | PASS |
| `cargo test --locked --all-features` | PASS — 176 passed, 0 failed |
| `npm run typecheck --prefix frontend` | PASS — both strict TypeScript projects |
| `npm run build --prefix frontend` | PASS — Vite production build |
| `npm test --prefix frontend` | PASS — 269 passed in 12 files, 0 failed |
| `npm test --prefix frontend -- tests/proxy/vite.test.ts` | PASS — 15 passed |
| `npm test --prefix frontend -- tests/proxy/integration.test.tsx` | PASS — six real fixture integrations passed serially |
| `git diff --check` | PASS; informational LF→CRLF checkout warnings only |

The focused portfolio suite passed 39 tests. The full frontend count is the 265-test baseline plus four net B3 cases; the deferred B3 assertion was replaced, not silently removed. Existing race, cancellation, snapshot identity, staleness, and exact-value tests remain in the passing suite.

## 9. Browser and network evidence

The successful CDP result is stored at `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b3-verification\results.json`. It recorded:

- invalid valuation request counts `0` after pointer and `0` after Enter;
- valid valuation request count `1`;
- total `11500.01200002`, BTC value `6500.012`, ETH value `5000.00000002`, and allocations `56.52%` / `43.48%`;
- zero external requests and zero runtime exceptions;
- only expected loopback application/module/API requests.

Initial temporary automation attempts stopped on evidence-script predicates/key encoding and were corrected outside the repository; they exposed no application defect or extra application scope.

## 10. Security and unchanged boundaries

The boundary remains controlled in-memory input → shared bounded validation → explicit local valuation POST. Invalid input fails before the request. Server-side validation remains authoritative, exact Decimal strings and the Rust endpoint are unchanged, and no delayed API response can initiate focus movement.

Rust source, API/contracts, arithmetic, Cargo files, frontend dependencies/lock, Vite/WebSocket configuration, CI, persistence, streaming, refresh behavior, credentials, wallets, transactions, and deployment are unchanged. No live Binance request was made. Dependency/advisory scanning was not rerun because dependencies did not change; this report does not refresh prior advisory evidence.

## 11. Remaining limitations

- Independent Technical Lead review and Product Owner acceptance remain outstanding.
- Real assistive-technology speech and non-Chrome/native-mobile behavior remain unverified.
- Browser evidence is local Windows Chrome fixture evidence, not a committed repeatable B4 harness or B5 final acceptance.
- Remote freshness and hosted CI were not checked.

## 12. Final local Git state

Expected unstaged modifications:

- `frontend/src/components/HoldingsInput.tsx`
- `frontend/src/components/PortfolioCalculator.tsx`
- `frontend/tests/components/Portfolio.test.tsx`

Expected untracked files:

- `docs/specs/0011-accessible-portfolio-form-error-recovery.md`
- `docs/M34_B3_IMPLEMENTATION_REPORT.md`

The final exact status is rechecked after writing this report. Nothing is staged.

## 13. Publication boundary and handoff

No commit, push, publication, or deployment occurred. M3.4 is not marked complete.

Technical Lead handoff: review the one-shot post-render focus mechanism, shared-validation reuse, invalid-request suppression, new component tests, Chrome accessibility evidence, and unchanged protected boundaries. Human acceptance is required before changing specification status or closing any milestone.
