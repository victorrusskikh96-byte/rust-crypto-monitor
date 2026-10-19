# M3.1 local implementation report

Date: 2026-10-19. Result: locally implemented and verified; **Technical Lead review
pending**. M2c and all earlier milestones are accepted by the Product Owner.
Specification 0005 remains APPROVED. This is not a Full-Stack MVP release.

## 1. Toolchain before and after

| Tool | Before | After |
| --- | --- | --- |
| Node | v24.18.0 | v24.22.0 LTS |
| Bundled npm | 11.16.0 | 11.19.1 |
| Codex CLI | 0.163.0 | 0.163.0 |

node --version, npm --version, codex --version and effective executable paths were
checked. Node/npm remain under C:/Program Files/nodejs; Codex remains under
C:/Users/victo/AppData/Local/Programs/OpenAI/Codex/bin. No model/global Codex or
npm configuration command was used. frontend/.npmrc is project-local only.

## 2. Official Node distribution verification

The official release index lists v24.22.0 (Krypton), release 2026-10-14, bundled
npm11.19.1. The official Windows x64 MSI was downloaded from nodejs.org. SHA-256
matched the official SHASUMS256.txt before installation:

`97ebad47ad35da4b59182a5fbe9fad2b1a1836f1042b4833ff5b4b9571175088`

Authenticode was Valid with OpenJS Foundation signer; installer exit0. No version
substitution or security-prompt bypass. Full sources/evidence and qualifications
are in [dependency review](security/m31-frontend-dependencies.md).

## 3. Genuine delegation evidence and ownership

The actual collaboration tool created exactly three child agents, no descendants:

| Agent task | Assignment and owned files |
| --- | --- |
| /root/frontend | App.tsx, styles.css, ModeNotice.tsx, ConnectionStatus.tsx |
| /root/backend | src/http/mod.rs and only the test-module include in src/http/tests.rs |
| /root/qa_security | frontend/tests/**, src/test/setup.ts, new Rust dev_ui_tests.rs, tests/http_startup.rs; independent dependency/runtime review |
| /root (Coordinator) | Exact manifest/lock/install, Vite/TypeScript/Vitest config, main/index, shared contracts/client/decoder, documentation, consolidation and gates |

Agents first performed bounded read-only preparation. Interfaces and single-writer
ownership were communicated before implementation release. QA defined tests before
behavior where practical; Backend obtained an exclusive Cargo slot for targeted
red/green tests. No agent spawned another agent, installed packages, selected models,
committed, pushed or deployed. All three returned completion/review messages through
actual collaboration tools; no sequential role simulation was used. Rust/frontend
heavy commands were serialized, Vitest maxWorkers2/fileParallelismfalse.

## 4–6. Exact dependencies, graph and security gate

All 13 exact direct pins are installed, with no extra direct package. The complete
version table, licenses, scripts, platform/engine checks and dated advisory evidence
are in [dependency review](security/m31-frontend-dependencies.md) and
[manifest](../frontend/package.json).

121 locked non-root entries =13direct +108transitive, including platform optionals.
96 physically installed Windows entries =13direct +83transitive. All121 registry
metadata versions/tarballs/SHA512/license values matched. Required peers satisfied;
optional compiler/browser/telemetry/native canvas peers not installed. npm audit
reported zero advisories at all severities. No force/legacy-peer-deps or upgrades.

Rolldown1.2.14 and LightningCSS1.33.0 use prebuilt win32-x64-msvc bindings, without
install scripts/native builds. Darwin-only fsevents2.3.3 node-gyp hook is excluded.
Prepare metadata was reviewed and not executed. npm ci used --ignore-scripts,
--engine-strict and --no-fund. The SHA256 lock hash stayed identical across ci:
`939179b346b26e6fbcf7cde444785622a11fa66192d07d72bff1251885753580`.

License metadata includes MPL-2.0 for LightningCSS; all license counts are recorded
in the review. No publication/license clearance, complete source/native audit,
signature verification of every npm tarball or enduring vulnerability guarantee.

## 7. Files created and changed

Changed existing files:

- .gitignore
- README.md
- docs/PROJECT_CONTEXT.md
- docs/PORTFOLIO_ROADMAP.md
- docs/specs/0005-freelance-portfolio-mvp.md
- src/http/mod.rs
- src/http/tests.rs (test module declaration only)
- tests/http_startup.rs

Created documentation/test files:

- docs/M31_IMPLEMENTATION_REPORT.md
- docs/security/m31-frontend-dependencies.md
- src/http/dev_ui_tests.rs

Created frontend files:

- .npmrc, package.json, package-lock.json, index.html
- vite.config.ts, vitest.config.ts, tsconfig.json, tsconfig.node.json
- src/main.tsx, src/App.tsx, src/styles.css
- src/api/contracts.ts, src/api/decode.ts, src/api/client.ts
- src/components/ModeNotice.tsx, src/components/ConnectionStatus.tsx
- src/test/setup.ts
- tests/contracts/fixtures.ts, decode.test.ts, client.test.ts, source-security.test.ts
- tests/components/App.test.tsx
- tests/proxy/vite.test.ts, integration.test.tsx

node_modules, dist and caches are ignored. No Cargo manifest/lock/toolchain, CI,
main/CLI implementation, market_data, portfolio, worker or fixture source changed.

## 8. Rust development-Origin policy

ServerMode retains Real/Fixture and adds DevUi/DevUiFixture. Only exact forms
--serve --dev-ui and --serve --fixture <approved scenario> --dev-ui are accepted.
No arbitrary Origin/port argument or implicit environment switch. Production
accepts only http://127.0.0.1:3000; development accepts only http://127.0.0.1:5173.
The backend Host stays exactly127.0.0.1:3000. GET without Origin remains allowed;
POST requires one exact Origin and application/json. Header checks and failure
precedence are unchanged; malformed/duplicate/null/missing/wrong Origins cannot
admit a refresh. Existing worker/cooldown/body/handler/connection limits remain.
Fixture development never invokes the production transport factory.

## 9. Vite proxy and security evidence

Actual running-server tests verify exact127.0.0.1:5173 acceptance and reject
localhost, foreign/wrong/duplicate/missing/forwarded authorities, absolute targets
and upgrades before file/proxy work. Node24 rejects missing HTTP/1.1 Host with400;
other tested guard rejections are403. CORS headers are absent. HMR and WebSocket
server are disabled. The root allowlist is only frontend; synthetic secrets and
outside Rust/source/OS paths are denied. Sensitive checks cover Windows case,
encoding, trailing-dot/space and NTFS stream variants, plus decoded backslash/NUL.

Only regex-prefix /api/v1/ proxies to fixed http://127.0.0.1:3000. Actual mock-backend
requests prove forwarded Host127.0.0.1:3000 and unchanged Origin (including absence,
null and foreign values). No dynamic target, upgrade forwarding or arbitrary API
prefix. forwarded authority headers are rejected, not trusted. No external
scripts/fonts/CDNs/telemetry. CSP scripts/connections are self-only; local inline
styles are allowed for Vite CSS injection.

## 10. Working frontend behavior

Responsive semantic graphite/green shell, system fonts, visible focus and live
connection status. One relative native-fetch GET on mount; no retries/polling or
refresh/calculator controls. Loading/disconnected failures use static text.
Validated server mode/scenario, persistent synthetic notice and opaque snapshot
identity are shown. API connectivity/worker readiness are separate from provider
availability. Initial success fixture has no observations; no prices are invented.

Strict runtime decoders cover schema1, exact ordered BTC/ETH identities/statuses,
nullable observations/timestamps, signed timestamp strings, unsigned ages,96bit/
28fractional-digit positive decimal strings, safe code-specific errors and fixture
provenance/notice. Unknown/missing/wrong fields fail closed. Financial values stay
strings; only integer BigInt bounds are used to validate price representation.
The client enforces JSON media type,32768byte response cap, safe errors, cancellation
and aborted/obsolete-result suppression; no configurable destination or provider URL.

## 11–12. Tests and quality gates actually executed

| Command | Result |
| --- | --- |
| cargo fmt --all -- --check | PASS |
| cargo clippy --locked --all-targets --all-features -- -D warnings | PASS |
| cargo build --locked --all-targets --all-features | PASS |
| cargo test --locked --all-features | PASS:176 tests, zero failed/ignored |
| npm run typecheck --prefix frontend | PASS: strict app and Node/test configurations |
| npm run build --prefix frontend | PASS:20modules, static production assets |
| npm test --prefix frontend | PASS:6files,85tests |
| npm ci --ignore-scripts --no-fund --engine-strict --prefix frontend | PASS:96packages; lock unchanged |
| npm ls --package-lock-only --all --prefix frontend | PASS: required peers satisfied |
| npm audit --package-lock-only --json --prefix frontend | PASS: zero findings |
| npm test --prefix frontend -- tests/proxy/vite.test.ts | Final targeted PASS:15tests after extra Windows path probes |

The final test additions did not change test count or production code. Typecheck
was repeated successfully after those additions. No concurrent Rust/frontend
builds or multiple heavyweight jobs. All169 baseline Rust tests remain; five
policy/isolation tests and two executable-startup tests were added. Frontend tests
cover loading/success/disconnection/malformed/schema/fixture/real/cancellation,
precision/contracts/no hidden calls, actual proxy/filesystem/headers/upgrades and
fixture integration. The source rule is a supplemental regression check, not proof
against every possible financial float conversion.

Test-first targeted cargo test --locked --all-features --lib dev_ui_tests --no-run
initially failed for missing DevUi variants; the implementation then passed5/5.
Initial frontend harness runs exposed a Vitest5 API difference, Vite's asset URL
transformation in a jsdom test and Node fetch's Host normalization. Tests were
corrected to use supported APIs, filesystem paths and controlled node:http/raw
clients. Missing-Host400 is accepted as parser-level rejection, not a bypass.
No security expectation or production filesystem allowlist was relaxed.

## 13. Bounded fixture integration smoke

The test verifies both ports free, starts only the built Rust executable with
--serve --fixture success --dev-ui, verifies Windows port3000 listener PID ownership
before any readiness GET, starts actual Vite on5173, fetches its HTML, and mounts
React in jsdom with a fixed local fetch bridge. Exactly one application GET passes
through Vite; the rendered UI contains fixture scenario/synthetic notice and empty
provider-attempt state. Production/null/localhost Origins are rejected through the
proxy; absent-Origin GET succeeds; wrong Host is rejected using controlled HTTP.
No refresh POST or Binance call. Both Vite and the supervised Rust child are closed/
reaped in cleanup, with bounded output/readiness/termination waits. Post-run check
found zero listeners on3000/5173 and no synthetic .env marker left in frontend.

## 14. Remaining limitations

No actual browser E2E, visual/screen-reader/viewport audit or browser binaries were
installed. RTL/jsdom and Node HTTP evidence does not prove browser layout, CSP or
all browser behavior. Production asset hosting by Rust, full market/portfolio UI,
manual refresh UI, persistence, Linux/clean-checkout parity, hosted final CI and
portfolio packet remain future work. Dependency review is metadata/SRI/advisory
based, with no exhaustive source/native audit or OS-enforced egress denial.
Non-Windows smoke does not establish listener PID identity. Local services are
not authentication against hostile local processes. Process/OS deadlines and
worker shutdown are not hard real-time guarantees. Existing adapter AC8/AC10 and
historical operational/security limitations remain open. Prior scanners were not
rerun; no new cargo-audit/Gitleaks result is claimed. No newly queried hosted CI.

## 15. Implementation-phase Git and scope status (before checkpoint)

HEAD and local origin/main remain
3f76710df5b0cda6ebbe9ad7dfc1da098dbde06e on main. Index empty; changes are unstaged
or untracked and confined to the file list above. Initial tree was clean, so no
unrelated work was discarded. No commit, push, deployment, public listener,
CI/workflow modification, live market call, wallet or trading implementation.
Final document checks passed: all local links in the six changed/new documents resolve, exact manifest/lock pins match, index is empty, preserved-core/CI/toolchain diffs are empty, and git diff --check passes. Git reports only expected LF/CRLF conversion warnings. Post-test listener count is zero.

## 16. Recommendation

Submit M3.1 for Technical Lead review without closing the milestone. After human
acceptance, specify M3.2 Market Dashboard: honest per-market states and exact
server strings, explicit user-driven refresh, safe request/state transitions and
fixture-based tests, retaining current Host/Origin/precision/resource controls.
Do not begin M3.2, add packages or publish from this recommendation.

## 17. Authorized Git checkpoint — pre-publication verification (2026-10-19)

The Product Owner authorizes exactly one commit named
`feat: add react frontend foundation and secure dev proxy`, one normal non-force
push to origin/main and exact-published-SHA Actions verification. M3.1 still awaits
independent Technical Lead source review; no milestone closure or M3.2 work.
No source, test, dependency, workflow or toolchain correction was made at this
checkpoint. The eight modified/27 created inventory was reconciled exactly, and
every new file was inspected before staging. Only checkpoint documentation was
updated. Cargo dependencies, adapter, exact financial code, worker and fixtures
remain unchanged. No generated output, cache, credential or unrelated file belongs
to the approved commit.

The three genuine child agents performed read-only frontend, backend and QA/security
reviews. No material defect/regression/scope conflict remained. A suspected DOS8.3
sensitive-file alias was checked against actual Vite: /NPMRC~1 and its /@fs form
both returned403 without configuration exposure. Vite has explicit Windows short-name
protection. The suspicion was not a confirmed bypass and no control was relaxed.
Both TypeScript configurations also passed with --skipLibCheck false, without
editing configuration, confirming no hidden declaration incompatibility in this
snapshot. An abort-test title claims more specificity than its assertions; actual
component unmount/cancellation tests and source guards remain the stronger evidence.

Re-executed successfully, sequentially:

- cargo fmt --all -- --check
- cargo clippy --locked --all-targets --all-features -- -D warnings
- cargo build --locked --all-targets --all-features
- cargo test --locked --all-features:176passed, zero failed/ignored
- npm ci --ignore-scripts --no-fund --engine-strict --prefix frontend:96packages,
  lifecycle scripts disabled, fsevents absent and lock SHA256 unchanged
- npm ls --package-lock-only --all --prefix frontend: required peers satisfied
- npm audit --package-lock-only --json --prefix frontend: zero known findings
- npm run typecheck --prefix frontend: PASS
- npm run build --prefix frontend: PASS
- npm test --prefix frontend:6files/85passed, including fixture Rust/Vite/React smoke
- npm test --prefix frontend -- tests/proxy/vite.test.ts:15passed

The repeated smoke used fixture success/dev-ui only, a verified owned Rust listener,
actual proxy GET, decoded API contract and rendered synthetic notice in jsdom.
Host/Origin rejection checks passed. No refresh POST or real provider call. Cleanup
left zero listeners on3000/5173 and no synthetic .env marker. A narrow redacted
pattern inspection of the35 reviewed files found no private keys, common provider
credentials or suspicious credential assignments; this is not a fresh Gitleaks or
cargo-audit scan and cannot establish absence of every secret or vulnerability.

Current GitHub Actions contains only the Rust Formatting, Clippy, Build and Tests
steps. There are no hosted React typecheck/build/Vitest jobs. Frontend verification
is local-only. Browser E2E/visual audit, deployment, full MVP and previously recorded
operational/security limitations remain pending. This section is prepared before
the single commit; the final checkpoint response records the actual published SHA,
push status and exact-SHA Actions URL/conclusions. No additional commit or amend is
authorized to backfill those future outcomes.
