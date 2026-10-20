# 0010 — FinTech UI refinement

## Status
APPROVED. The Product Owner authorized M3.4 Phase B1+B2 local implementation on 2026-10-20. Technical Lead review and milestone acceptance remain pending.

## Problem
The M3.3 dashboard is functionally complete and visually coherent, but its only market-refresh action follows the market cards, important supporting text is sometimes about 10 CSS pixels, resting quantity-input borders measure below the 3:1 contrast objective, and primary controls have slightly inconsistent hit-area heights. Some copy also describes a “selected” snapshot although users cannot select snapshots.

## Goals
- Put the existing manual refresh control before Market Overview without changing its props, callbacks, state, or request behavior.
- Make user-facing instructions concise and accurate while preserving stale, incomplete, synthetic, provider, cooldown, and exact-financial meanings.
- Improve important supporting-text readability, resting input boundaries, and primary action target consistency with a small CSS patch.
- Preserve all exact decimal strings, responsive layouts, accessibility semantics, and security boundaries.
- Verify the real fixture application in installed Chrome at 320, 375, 768, 1024, and 1440 CSS pixels.

## Non-goals
- Form focus recovery or error-summary navigation (M3.4 B3).
- A committed browser harness (M3.4 B4), final visual acceptance (B5), animation, streaming, polling, persistence, or new functionality.
- Rust, API, financial-contract, Vite configuration, dependency, CI, or deployment changes.
- A design-system or stylesheet replacement.

## Functional requirements
1. `App` renders the one existing `RefreshControl` before `MarketOverview`; all current props and callbacks remain attached to that instance.
2. Refresh stays explicit and single-flight. Cooldown and read-only reconciliation behavior and request counts remain unchanged.
3. Portfolio and refresh copy describes the latest confirmed or currently accepted market data without implying snapshot selection, provider continuity, trading, or live streaming.
4. Synthetic-data notices, stale and previous-quote warnings, incomplete results, provider errors, exact monetary strings, estimate qualifications, and cooldown guidance retain their meaning.
5. Important asset, portfolio, input, incomplete, and outdated supporting text uses a readable baseline near 12 CSS pixels. Technical timestamps and snapshot identifiers may remain secondary.
6. Resting quantity inputs have a boundary measuring at least 3:1 against both the adjacent form surface and input interior in tested Chrome, while the current focus-within indicator remains visible.
7. Refresh, reconcile, calculate, and cancel controls have a minimum 44 CSS-pixel target height where rendered.
8. Exact financial values wrap without truncation, ellipsis, floating-point conversion, or horizontal page overflow.

## Non-functional requirements
- Preserve semantic HTML, labels, field error associations, `aria-invalid`, `aria-describedby`, live regions, keyboard behavior, focus visibility, and responsive breakpoints.
- No automatic input focus change is introduced in this slice.
- No package installation, dependency change, external asset, browser-to-provider request, new storage, WebSocket use, or animation.
- Browser checks use only offline fixtures and already installed Chrome/CDP capability, with temporary evidence outside the repository and bounded owned processes.
- The existing local Host, Origin, fixed proxy, request bounds, and no-WebSocket controls remain unchanged.

## Acceptance criteria
- **AC1:** The single Refresh control precedes Market Overview in document order and is visible without scrolling at 1440×1000 in the tested fixture UI.
- **AC2:** One explicit refresh produces one refresh POST; duplicate protection, cooldown, and reconciliation request behavior remain unchanged.
- **AC3:** Copy is shorter and accurate, and no required safety, provider, stale, incomplete, synthetic, or financial meaning is lost.
- **AC4:** Important supporting text is at least 12 CSS pixels in the reviewed selectors without flattening the established hierarchy.
- **AC5:** Tested computed input-border contrast reaches 3:1 against relevant adjacent surfaces and the focus treatment remains visible.
- **AC6:** Rendered refresh, reconcile, calculate, and cancel controls meet the 44 CSS-pixel target-height objective.
- **AC7:** No horizontal page overflow, hidden digits, or clipped focus indicators occurs at 320, 375, 768, 1024, or 1440 CSS pixels.
- **AC8:** Success, partial, stale, timeout, rate-limit, and unavailable fixture behavior remains truthful; the golden total is exactly `11500.01200002 USDT` with `56.52%` and `43.48%` allocations.
- **AC9:** Four Cargo gates, frontend typecheck/build/tests, the focused 15-test Vite security suite, all six real fixture integrations, and `git diff --check` pass.
- **AC10:** Locks, dependencies, Rust, APIs, persistence, streaming, animation, Vite configuration, CI, and Git history remain unchanged.

## Verification plan
1. Add focused deterministic component/source tests for refresh order and uniqueness, intentional copy, preserved request counts and semantics, CSS readability/border/target rules, unchanged breakpoints, and the absence of focus-recovery behavior.
2. Run the focused tests before and after implementation, then run frontend typecheck, build, and the complete Vitest suite with no more than two workers.
3. Run the four Cargo gates sequentially and confirm the 176-test Rust baseline.
4. Run the focused 15-test Vite security suite and the existing six-scenario React → Vite → Rust integration suite serially.
5. Use installed Chrome through CDP without adding a package or committed harness. Capture and inspect temporary synthetic-fixture screenshots at all five widths; measure order, visibility, target geometry, input colors/contrast, overflow, exact strings, focus, and incomplete/error presentation.
6. Review the complete diff, protected-file inventory, lockfile hashes, `git diff --check`, and final Git state. Record the existing rejected Vite development-client WebSocket and favicon observations without changing configuration.

## Dependencies and risks
- Depends on specifications 0005, 0008, and 0009 and accepted ADR 0003. Their request, state, and exact-decimal contracts remain authoritative.
- Larger type and target sizes can increase vertical height on narrow screens; five-width Chrome evidence mitigates this risk.
- Copy edits can accidentally weaken stale/provider distinctions; focused semantic tests and six fixture checks guard them.
- Vite's injected development client may continue attempting a WebSocket that the secure local boundary rejects. Remediation is separately scoped and does not authorize weakening the boundary.
- Real screen-reader speech, forced-colors mode, native mobile browsers, physical touch, and browser zoom remain outside this slice.

## Open decisions
None. Product Owner authorization fixes the B1+B2 boundary; B3, B4, B5, Vite remediation, publication, and milestone acceptance require later approval.
