# M3.4 B1+B2 implementation and verification report

## Status and verified baseline

M3.4 B1+B2 local implementation and verification are complete for Technical Lead
review. This does not close M3.4 or imply Product Owner acceptance. B3, B4 and B5
remain deferred.

- Repository: `C:\Projects\rust-crypto-monitor`
- Branch: `main`
- HEAD and local `origin/main`: `7f04f51ff15d994ef6f5dc084d626d3ce760aff0`
- Index: empty before and after verification
- Baseline history, Rust implementation and Git history: unchanged
- No commit, push, deployment, package installation or live provider request occurred

## Recovered changes and specification 0010 compliance

The recovered tree matched the authorized inventory and specification 0010. The
single existing `RefreshControl` now precedes `MarketOverview`; its props, explicit
refresh callback, cooldown calculation and read-only reconciliation callback are
unchanged. A focused component test verifies one refresh region/button, document
order and the absence of an extra request.

User-facing refresh, provenance, attempt and portfolio wording is shorter and no
longer implies that users select snapshots. Synthetic, provider, stale, incomplete,
cooldown, exact-estimate, no-trading and no-wallet meanings remain visible. Missing
and stale holding reasons remain distinct.

The CSS patch raises important supporting text to 12px, changes the resting input
border from `#4a5b50` to `#5c7163`, applies a 44px minimum height to both action
groups, preserves the focus treatment and retains the existing graphite/green
design and breakpoints. Exact-value elements retain `overflow-wrap: anywhere` and
no ellipsis was introduced.

No focus recovery was added. The new B3-deferral test confirms that an invalid
submission leaves focus on Calculate while retaining field associations and making
no valuation request.

## Changed-file inventory

Recovered tracked modifications:

- `frontend/src/App.tsx`
- `frontend/src/components/AssetValuationRow.tsx`
- `frontend/src/components/MarketCard.tsx`
- `frontend/src/components/PortfolioCalculator.tsx`
- `frontend/src/components/PortfolioSummary.tsx`
- `frontend/src/components/RefreshControl.tsx`
- `frontend/src/styles.css`
- `frontend/tests/components/App.test.tsx`
- `frontend/tests/components/Portfolio.test.tsx`

Recovered untracked files:

- `docs/specs/0010-fintech-ui-refinement.md`
- `frontend/tests/contracts/ui-refinement.test.ts`

This report is the only additional repository file created by final verification.
The complete tracked diff plus the full contents of both originally untracked files
is preserved outside the repository at:

`C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b1b2-verification\M34_B1_B2_SOURCE_DIFF.patch`

## Executed gates

All commands ran from the repository root and completed successfully:

| Command | Result |
| --- | --- |
| `cargo fmt --all -- --check` | PASS |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| `cargo build --locked --all-targets --all-features` | PASS |
| `cargo test --locked --all-features` | PASS: 176, zero failed/ignored |
| `npm run typecheck --prefix frontend` | PASS: both TypeScript configs |
| `npm run build --prefix frontend` | PASS: Vite 8.3.4, 31 modules |
| `npm test --prefix frontend` | PASS: 12 files, 265 tests |
| `npm test --prefix frontend -- --run tests/proxy/vite.test.ts` | PASS: 15/15 |
| `npm test --prefix frontend -- --run tests/proxy/integration.test.tsx` | PASS: 6/6 |
| `git diff --check` | PASS |

The 265-test total is the previous 258-test suite plus all seven new B1+B2 tests.
Both `frontend/tsconfig.json` and `frontend/tsconfig.node.json` retain
`skipLibCheck: false`.

## Chrome 155 evidence

Chrome `155.0.8059.85` was driven through CDP with an isolated temporary profile.
Only owned Rust fixture, Vite and Chrome processes were launched; all were reaped.
The final listener check found no process on loopback ports 3000, 5173 or 9222.

The success fixture was inspected at a 1000px viewport height:

| Width | Refresh top/bottom | Refresh | Calculate | Page overflow | Focus |
| ---: | ---: | ---: | ---: | --- | --- |
| 320 | 662.16 / 938.47px | 44px | 45.19px | none (305=305px) | unclipped |
| 375 | 576.36 / 833.48px | 44px | 45.19px | none (360=360px) | unclipped |
| 768 | 578.45 / 728.02px | 44px | 45.19px | none (753=753px) | unclipped |
| 1024 | 564.45 / 714.02px | 44px | 45.19px | none (1009=1009px) | unclipped |
| 1440 | 564.45 / 714.02px | 44px | 45.19px | none (1425=1425px) | unclipped |

The narrower document client widths reflect Chrome's vertical scrollbar; each
recorded `window.innerWidth` was exactly the requested width. At 1440x1000 the
entire refresh panel and action were visible without scrolling.

Rendered reconciliation height was 44px. Rendered cancel height was 45.19px while
a locally delayed fixture valuation kept the control displayed. Focus geometry at
every width included the 2px outline plus 3px offset within the viewport, and no
overflow-hiding ancestor was found.

The resting border was `rgb(92, 113, 99)` (`#5c7163`) at all five widths. WCAG
relative-luminance measurements were 3.38:1 against the `rgb(18, 26, 21)` input
interior and 3.22:1 against the `rgb(25, 30, 27)` adjacent panel surface. The focused
border remained `rgb(156, 225, 180)` with the existing outline.

Rendered important support selectors were 12px. This included units, hints,
privacy/state labels, valuation units/details, result notes and footnotes in the
success view, plus the incomplete-reason text in partial, stale, timeout,
rate-limit and unavailable views.

Screenshots were visually inspected and show no clipped digits, horizontal page
overflow, focus clipping or design regression:

- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b1b2-verification\success-320x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b1b2-verification\success-375x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b1b2-verification\success-768x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b1b2-verification\success-1024x1000.png`
- `C:\Users\victo\AppData\Local\Temp\rust-crypto-m34-b1b2-verification\success-1440x1000.png`

## Fixture and exact-value findings

The real success fixture displayed BTC `65000.12`, ETH `2500.00000001`, total
`11500.01200002 USDT`, holding values `6500.012 USDT` and `5000.00000002 USDT`,
and allocations `56.52%` / `43.48%`. Every exact-value element fit its rendered
box at every width; all digits remained visible.

The other real fixture scenarios remained truthful:

- partial: exact BTC value retained; ETH timeout; incomplete total/allocations
- stale: both exact prior quotes marked stale/previous; incomplete valuation
- timeout: both markets unavailable with timeout failures
- rate-limit: BTC 429/120-second Retry-After; ETH correctly not attempted
- unavailable: both markets unavailable with simulated HTTP 503 outcomes

Every scenario retained both the fixture-mode warning and portfolio synthetic-data
notice. No scenario caused a browser exception.

## Security, integrity and browser limitations

`git diff --quiet` passed for `src`, `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`,
`.github`, `frontend/package.json`, `frontend/package-lock.json` and
`frontend/vite.config.ts`. Inspection found no storage, telemetry, external asset,
new destination, automatic refresh, streaming, animation, wallet or trading code.
CDP recorded only `127.0.0.1` requests and zero external requests. Fixture startup
uses the synthetic factory and never constructs or contacts the production provider.

Expected development-only observations remain: Vite's injected client attempted a
loopback WebSocket on each page load and received HTTP 403, and `/favicon.ico`
returned 404 once. No policy was weakened. Chrome also printed the normal React
DevTools informational suggestion, but made no request to it. There were zero
runtime exceptions and zero other failed network loads.

This verifies Chrome on the installed Windows environment, not native mobile
browsers, forced-colors, browser zoom, physical touch or screen-reader speech.
Temporary CDP automation is evidence only and is not a committed B4 harness.
Visual inspection supports this B1+B2 verification but does not constitute final
B5 Product Owner visual acceptance.

## Deferred work and handoff

- B3 focus recovery/error-summary navigation: not implemented.
- B4 committed browser automation harness: not implemented.
- B5 final visual acceptance: not complete.
- Hosted/Linux frontend reproduction and human milestone acceptance remain pending.

No blocking B1+B2 defect was found. Stop at Technical Lead review; do not mark the
overall M3.4 milestone complete and do not commit or publish without new approval.
