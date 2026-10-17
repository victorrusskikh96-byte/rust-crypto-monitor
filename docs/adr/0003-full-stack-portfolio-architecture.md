# ADR 0003 — Full-Stack Portfolio Architecture

## Title
Preserve the synchronous Rust adapter behind a bounded local API and small React UI.

## Date
2026-10-17.

## Status
ACCEPTED. Technical Lead M1 request on 2026-10-17 authorizes acceptance after
checking the actual M0.1 text; no material architectural conflict was found.
Accept Rust core + future Axum/Tokio + React/TypeScript/Vite, preserving the
synchronous adapter and isolating it in one bounded worker in the future backend.
Exact versions remain implementation-stage compatibility/security candidates.
Acceptance grants no package installation, web/frontend code, CI or publication.
Current implementation scope is the synchronous CLI in specification 0006.
Historical M0/M0.1 proposal/conditional-approval evidence remains recorded below.

## Context and decision drivers
The current main at `0f95a3c` contains an exact-decimal, synchronous, public-only
Binance adapter and 60 deterministic tests; main is empty. An Upwork portfolio
needs observable backend and full-stack workflows: market overview, manual
valuation and honest provider health. Minimize infrastructure, preserve existing
work, support offline demos and Windows/Linux reproduction, and prevent financial
or availability overclaims. [Specification 0005](../specs/0005-freelance-portfolio-mvp.md)
defines proposed contracts and measurable gates.

## Alternatives
| Option | Benefits | Costs / suitability |
| --- | --- | --- |
| A: Rust CLI only | Smallest change; accepted synchronous baseline and existing seams fit. | Does not satisfy the mandatory browser dashboard or demonstrate frontend skills. Useful historical stepping stone, not this MVP. |
| B: Rust core + Axum + React/TypeScript/Vite | Clear typed HTTP boundary, testable backend state, familiar component UI, strong backend/full-stack demonstration; single Rust runtime process plus static assets. | Application async runtime, worker lifecycle, npm/toolchain and browser tests add complexity; needs explicit architectural approval. |
| C: Small synchronous Rust HTTP server + static HTML/CSS and vanilla JavaScript | No React/Vite/Node build pipeline if handwritten static assets; one server thread can own blocking adapter, financial arithmetic remains Rust-side. | Still needs a reviewed HTTP server crate, connection/body/deadline controls and frontend state tests. Blocking fetch can prevent state/health reads unless a worker is added. Less typed frontend demonstration and manual DOM/state maintenance. Never handwrite an HTTP parser. |

C remains a documented lower-complexity alternative; M0.1 conditionally selects B.
B is the smallest recommended option meeting the chosen typed frontend/backend
portfolio objective without database, authentication, SSR, container or cloud stack.

## Decision (accepted architecture; future implementation separately scoped)
Keep one Rust package/binary and unchanged market_data library; add application
DTO/valuation/state modules and a loopback Axum server. Frontend lives in a separate
directory and builds static assets served by that server. Use React local state,
TypeScript discriminated unions, native fetch and CSS; no router, global state
framework, UI kit, financial JavaScript library or chart package needed.
Rust alone computes exact holdings, totals and allocation display strings.

The proposal changes the CLI-only and no application-owned async runtime constraints
in [architecture](../architecture.md), [ADR 0001](0001-market-data-adapter.md) and
specification 0003 NFR1 only at the future application boundary. M1 acceptance
explicitly approves that extension, now recorded in architecture; the adapter's
synchronous single-attempt contract and current CLI runtime remain unchanged. It preserves ADR 0001's synchronous
adapter, fixed provider, one attempt, bounded transport, exact Price and safe errors.
Caching is application state with explicit provenance/staleness, never adapter fallback.
[ADR 0002](0002-security-by-design.md) remains mandatory without exception.

## Safe synchronous integration and runtime implications
A dedicated std::thread owns the production transport: create, use and drop it on
that thread, outside the application Tokio runtime. Construct local adapter/Clock
references inside the worker; do not require current dyn HttpTransport or dyn Clock
to become Send/Sync or place the borrowing adapter in Axum shared state.
One bounded command channel and completion channel connect async handlers to worker;
no blocking send/recv on runtime threads. Use nonblocking admission/send and
async completion notification (Tokio oneshot); capacity one and no waiting second batch.
The application uses a current-thread Tokio scheduler; reqwest retains its own
internal runtime. See the specification M0.1 state machine for admission/error
precedence, BTC-first order, waiter timeout/cancellation, startup and shutdown.
At most 32 tracked connection tasks, 8 active API handlers, one market worker
and one refresh waiter; no unbounded application task/thread spawning.

One process-wide admission token covers a full two-pair sequential batch and remains
owned until the worker actually finishes. Reject another refresh immediately:
no unbounded queue, per-request threads, retry scheduler or lost single-flight token
on client cancellation. Capacity one is an upper bound, not permission for a pending
second batch. Shared state holds two observations/attempts only; take short locks
for updates/snapshots, never across fetch. Provider 418/429 stops the batch and
sets conservative process-wide cooldown per specification.

Start worker before serving; client initialization failure prevents real-mode
readiness with safe diagnostics. Shutdown stops admission, signals worker and joins
outside the async runtime. An in-progress call finishes under configured budgets; stopping is checked before
any second call, which is skipped without fabricated attempt metadata. No forcible
cancellation; a stuck DNS/OS call can delay shutdown and must be reported.
No replacement worker is spawned to evade this limit.

Alternative spawn_blocking can isolate calls, but requires a semaphore acquired
before spawn and retained by the closure, plus safe client destruction; rejected
for initial implementation because dedicated ownership is easier to inspect.
[Tokio documentation](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)
states started blocking tasks cannot be aborted.
[reqwest blocking documentation](https://docs.rs/reqwest/0.13.5/reqwest/blocking/)
forbids executing blocking client code inside an async runtime.

## API and frontend contract
Versioned JSON GET dashboard, POST refresh and POST valuation as specified in
[0005 API contracts](../specs/0005-freelance-portfolio-mvp.md).
Use decimal strings throughout financial fields; explicit nullable values and
discriminated states, opaque snapshot generation, safe error codes and separate
mode/provenance. Backend validates inputs, snapshot identity and freshness at
calculation time. GET dashboard and POST valuation never perform provider I/O; only an admitted
POST refresh can. Initial loading does not fetch implicitly. Busy refresh is 409,
cooldown 429, infrastructure/stopping 503 and detached waiter deadline 504.
No client-supplied prices. UI stores quantities as strings and
renders backend arithmetic. Snapshot conflicts require explicit recalculation.
Freshness is monotonic observation age, not wall time or proof of market freshness.

## Compatibility and concrete dependency proposal (M0.1)
Exact candidates below are proposals only, checked against official versioned
manifests/release pages on 2026-10-17. Nothing was installed/resolved; declared
compatibility is evidence, not a successful build or a clean advisory scan.

| Candidate / exact version | Proposed use/features | Declared compatibility and license |
| --- | --- | --- |
| Axum 0.8.9 | default-features=false; http1,json,tokio only | [Manifest](https://raw.githubusercontent.com/tokio-rs/axum/axum-v0.8.9/axum/Cargo.toml); [workspace MSRV](https://raw.githubusercontent.com/tokio-rs/axum/axum-v0.8.9/Cargo.toml) 1.80; MIT. Tokio requirement ^1.44 permits 1.53.1; existing serde_json pin meets ^1.0. Axum adds serde_json raw_value through feature unification, requiring review. |
| Tokio 1.53.1 | default-features=false; rt,net,sync,time,signal,macros; current-thread scheduler | [Manifest](https://raw.githubusercontent.com/tokio-rs/tokio/tokio-1.53.1/tokio/Cargo.toml) MSRV 1.71, MIT. No full or application rt-multi-thread feature requested; reqwest may unify additional features internally. |
| React and React DOM 19.3.1 | Browser client only; matching exact versions | [Release](https://github.com/react/react/releases/tag/v19.3.1), [DOM manifest](https://raw.githubusercontent.com/react/react/v19.3.1/packages/react-dom/package.json) accepts React ^19.3.1; both MIT. No SSR/RSC server packages or React Compiler plugin. |
| TypeScript 6.0.3 | Dev-only tsc --noEmit; conservative JS-based compiler line rather than migrating to 7 | [Manifest](https://raw.githubusercontent.com/microsoft/TypeScript/v6.0.3/package.json) Node >=14.17, Apache-2.0. Vite transpilation is not typechecking; React DOM/type definitions still need matching-version review. |
| Vite 8.3.4 | Dev server and static build only | [Manifest](https://raw.githubusercontent.com/vitejs/vite/v8.3.4/packages/vite/package.json) Node ^20.19.0 or >=22.12.0; MIT. Native Rolldown/Lightning CSS dependencies add platform/supply-chain risk. |
| @vitejs/plugin-react 6.1.2 | Dev-only React transform/HMR, compiler options disabled | [Manifest](https://raw.githubusercontent.com/vitejs/vite-plugin-react/plugin-react%406.1.2/packages/plugin-react/package.json) Vite ^8.0.0 permits 8.3.4; same Node range; MIT. Do not install optional compiler/Babel peers without need/review. |
| Node 24.22.0 LTS / bundled npm 11.19.1 | Build/test tools, not production server runtime | [Node release](https://github.com/nodejs/node/releases/tag/v24.22.0), [bundled npm manifest](https://raw.githubusercontent.com/nodejs/node/v24.22.0/deps/npm/package.json); Node meets all engine ranges; Node MIT plus bundled third-party licenses, npm Artistic-2.0. [Node license inventory](https://raw.githubusercontent.com/nodejs/node/v24.22.0/LICENSE). |
| Styling / visualization: no package | Plain CSS, semantic HTML allocation table | No Tailwind, UI kit, chart, icon/font CDN or decimal JavaScript dependency. No version/license burden added. |

Rust 1.99.0 exceeds the two declared MSRVs; existing reqwest 0.13.5, serde 1.0.229,
serde_json 1.0.154 and rust_decimal 1.43.0 pins remain untouched. Axum's own
optional/dev reqwest dependency is not permission to enable its private test
features or introduce another production client. Feature unification/transitive
MSRV and native TLS builds still require locked Windows/Linux verification.

The future web dependency milestone must review exact supporting HTTP server/helper/test/type-definition packages
before adoption: bounded accept/parser configuration may need direct Hyper,
Hyper-util, Tower and http-body-util access. Prefer fixed embedded built assets
rather than filesystem traversal middleware; no tower-http fs/CORS dependency is
selected. Vitest, Testing Library, Playwright, @types/react, @types/react-dom and
any @types/node versions are not approved by this candidate table. They require
exact proposal, compatible peer graph, licenses/advisories and separate installation
authorization before frontend/test implementation. Do not use skipLibCheck
or forced peer resolution to hide incompatibility.

No Cargo/npm manifest or lock change is authorized. Before adopting any candidate:
verify registry artifact/tag correspondence and integrity, complete transitive
source/features/MSRV/license/native-code review, current advisories with dated
database evidence, then lock and build under separately approved scope. No new
stack's vulnerabilities, runtime behavior or browser support is verified now.
Existing scanner reports cover only their historical repository snapshot.

## Security consequences
New boundaries are browser/localStorage -> loopback API, async handlers -> blocking
worker, static asset paths -> filesystem, and frontend packages/build -> runtime.
Propose exact Host/Origin checks, same-origin production and Vite /api proxy in
development, no wildcard CORS, strict JSON/body/input/resource limits, no body logs,
safe headers/CSP and loopback-only binding. CORS is not authentication or CSRF
protection: reject disallowed origins server-side. Do not expose service publicly.

Default quantities are memory-only; explicit localStorage opt-in stores plaintext
quantities only and has clear/validation/error handling. Local valuation requests
never forward holdings to Binance. No telemetry, remote assets, credentials,
accounts or wallet operations. Fixture mode is startup-only and never falls back
silently from real mode. Preserve TLS, fixed egress and adapter security controls.
Connection/handler/thread/channel bounds and precise numeric overflow tests are
release gates, not implementation claims. Local malicious processes remain a risk.
Public hosting would require a new security/operational design and authorization.

## Consequences and trade-offs
A single API and static UI demonstrate end-to-end work without persistent backend
storage. B costs more tooling and lifecycle testing than C. Sequential fetches
can take two request budgets; cancellation cannot stop started blocking work.
Only two in-memory observations exist, lost on restart. Stale values are displayable
but cannot value positive holdings. Provider quotas/shared-IP/region and data age
remain uncertain. Exact bounds reject extreme arithmetic instead of rounding.
Offline browser tests establish state/contract behavior, not real TLS or provider
availability. Existing adapter acceptance and current hosted evidence gaps persist.

## Reconsideration triggers
Revisit through reviewed scope/ADR for public deployment, authentication, multiple
users, polling/streaming, more providers/pairs, persistence/history, substantially
higher concurrency, incompatible MSRV/dependency graph, non-representable common
valuation inputs or demonstrated inability to enforce resource bounds. Choose C
at review if the Node/React toolchain cost outweighs its portfolio benefit.
No trigger authorizes automatic implementation or financial capabilities.

## Implementation gates after M1 acceptance
Final architecture/specification review and application-boundary reconciliation
are accepted in M1. Exact candidate/supporting/transitive/test dependency adoption
still requires compatibility, license/security and platform verification before
separately authorized installation. No new stack build/advisory evidence is inferred.
Current M1 CLI introduces no web/runtime dependencies; full-stack implementation
and portfolio-release acceptance remain future work.

## Related specification links
- [Approved portfolio MVP 0005](../specs/0005-freelance-portfolio-mvp.md).
- [Approved adapter 0003](../specs/0003-market-data-adapter.md).
- [Security baseline](../security/security-baseline.md).
- [Portfolio roadmap](../PORTFOLIO_ROADMAP.md).

