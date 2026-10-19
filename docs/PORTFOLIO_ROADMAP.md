# Web3 Career Strategy and Portfolio Roadmap

## Status and objective

Phase W3.0, 2026-10-16: human-accepted at the consolidated checkpoint. This roadmap
sets direction, not implementation authorization, accepted architecture for future
repositories, fixed delivery dates, or a guarantee of employment. Follow the
[project context](PROJECT_CONTEXT.md), [agent instructions](../AGENTS.md),
[architecture](architecture.md) and [security baseline](security/security-baseline.md).
Existing approved specifications and accepted ADRs remain authoritative.

Transition into Web3 engineering by combining approximately three years of
commercial backend experience with demonstrable independent Rust and Solana
portfolio experience. Target roles, in order: Web3 Backend Engineer, Rust
Blockchain Infrastructure Engineer, and Solana Smart Contract Developer.
Describe commercial backend work and independent portfolio work separately in
CVs, demonstrations and interviews. Do not imply unproven commercial Rust or
Solana experience. Employment and contracts are the primary monetization goal;
SaaS subscriptions and live trading are not current priorities.

Prioritize demonstrated competence over feature count. Milestones have evidence
and approval gates rather than delivery dates. Finish Rust Crypto Monitor first.

## M0 update — Freelance portfolio MVP (2026-10-17)

The Product Owner approved international Upwork portfolio direction and this
documentation milestone. The immediate goal is a finished Crypto Market & Portfolio
Dashboard demonstrating Rust backend and full-stack skills; longer-term Web3
employment and Projects B/C remain valid. No implementation or new stack is approved.
[Draft specification 0005](specs/0005-freelance-portfolio-mvp.md) and
[proposed ADR 0003](adr/0003-full-stack-portfolio-architecture.md) are review inputs.

M0.1: Technical Lead conditionally approves Option B (Rust core + Axum API +
React/TypeScript/Vite). At that historical checkpoint specification stayed DRAFT
and ADR PROPOSED; the M1 update below supersedes those approval statuses.
Refinements define one bounded transport-owning worker, request/shutdown lifecycle,
deterministic refresh/cooldown, exact decimal valuation and loopback Host/Origin/
resource limits. ADR 0003 records exact proposed dependency versions with official
metadata and licenses; transitive/advisory/platform verification remains M1 work.
No implementation, install, CI, provider requests, commits or pushes are authorized.

M1 update: after checking the M0.1 text, specification 0005 is APPROVED and
ADR 0003 ACCEPTED for the future full-stack direction. Exact dependency versions
remain verification candidates. The Technical Lead explicitly scopes current M1
to a working one-observation synchronous CLI, recorded in
[0006](specs/0006-read-only-cli.md). This overrides the older M0 milestone label
“M1 stack preparation”; it does not remove or implement any dashboard capability.
Later full-stack steps and supporting dependency/security review remain separately
authorized work; no web install/code, live checks, commits or publication in M1.

M2b.1 update (2026-10-18): M1/M2a are accepted. The Product Owner authorized
reviewed exact HTTP dependencies and a bounded local dashboard/valuation API.
Implementation passes Windows Cargo gates/137 tests and is human-accepted at
the M2b.1 Git checkpoint request; only one commit/push is authorized.
Provider worker/refresh (M2b.2), frontend and portfolio release remain deferred;
[0005 evidence](specs/0005-freelance-portfolio-mvp.md) records scope and limitations.

## M3.2 local checkpoint (2026-10-19)

The Product Owner authorizes the market dashboard on published M3.1 baseline
e1fe014336a0932e9d287c926873d24285eb83ff. Market cards, explicit refresh and Provider
Health are implemented locally under [specification 0008](specs/0008-market-dashboard.md);
[the report](M32_IMPLEMENTATION_REPORT.md) distinguishes gates and independent review.
No portfolio calculator, release or deployment is included. Acceptance remains
pending Technical Lead review; the complete Project A MVP is not finished.

## Project A — Rust Crypto Monitor

An off-chain Rust engineering portfolio project in this repository. Demonstrate
reliable exchange connectivity, exact financial data processing, explicit errors
and timeouts, security controls, deterministic testing, observability and measured
performance. These are completion targets, not claims that all exist today.
Preserve the synchronous adapter, exact prices, fixed public provider, bounded
reads, one attempt and safe failures from
[specification 0003](specs/0003-market-data-adapter.md) and
[ADR 0001](adr/0001-market-data-adapter.md).

| Milestone | Independently verifiable result and review gate |
| --- | --- |
| A1 — Finish adapter checkpoint | Reconcile committed evidence with current Git, rerun required gates under approved scope, address AC8 OS-enforced network-denial evidence and obtain explicit human AC10 closure review. Keep unresolved criteria partial; do not mark the specification IMPLEMENTED prematurely. |
| A2 — Dashboard MVP proposal | M0 proposes market overview, manual BTC/ETH quantities with exact Rust-side USDT valuation/allocation, and honest provider health; explicit stale/unavailable/loading states and labeled fixtures. Option B and the future runtime extension are accepted through M1 text review; exact dependencies and each implementation milestone still require verification/authorization. Standalone CLI is no longer required first. |
| A3 — Portfolio evidence | Approve bounded, safe diagnostic output and a reproducible measurement plan before implementation. Record fixture workload, environment, sample count, latency distribution and resource measurements with limitations; distinguish local processing measurements from optional live-network timing. Prepare the quality packet below and demonstrate CI for the exact reviewed commit. |

M0 replaces the earlier CLI-first next step with architectural review of the
dashboard. Historical CLI/synchronous choices remain recorded in architecture and
ADR 0001; the future application runtime extension is now accepted/reconciled
through M1. The adapter remains synchronous.
Current implementation sequence (supersedes historical M0 numbering): M1 CLI,
M2a exact valuation, M2b.1 local API, M2b.2 bounded worker and M2c fixtures are
Product Owner-accepted. **M3.1 — Multi-Agent React Foundation & Secure Rust API
Integration** is locally implemented, pending Technical Lead review. It includes
exact Node/npm, reviewed frontend dependencies, minimal React shell, strict Vite
proxy and the closed explicit development-Origin policy.

M3.1 Git checkpoint: one commit/normal push and exact-SHA Actions verification are
Product Owner-authorized after final local checks. Independent Technical Lead
source review remains pending. Hosted CI is Rust-only; React gates are local-only.
Browser E2E, visual audit, deployment and full MVP acceptance remain future work.
**M3.2 — proposed Market Dashboard** should add the separately approved market
presentation/explicit refresh workflow after M3.1 review. Full portfolio UI,
provider-health presentation, optional persistence, reproduction/E2E, separately
approved CI and portfolio release remain later scopes. Names/numbers beyond the
approved slice are not implementation authorization. The Full-Stack MVP is not
released. See [M3.1 report](M31_IMPLEMENTATION_REPORT.md) and specification 0005.
Client-ready means working scenarios, real observations when available, explicit
provider failures and provenance, accurate valuation, clean-checkout Windows/Linux
setup, passing backend/frontend tests, hosted CI for the exact final commit,
security review and accepted architecture. Produce 3–5 genuine screenshots, a short
recorded success/failure demonstration, honest English README and Upwork case study.
Label fixture captures and independent versus commercial experience. These are
future deliverables, not artifacts produced in M0; no hosting is required.

Local-only quantity persistence is proposed with opt-in and privacy controls.
No polling, fallback, accounts, credentials, trading, wallet or payment capability.
Optional Solana public-address balance lookup requires separate specification,
security review and approval and must not block release. Projects B/C remain
separate longer-term work; no signing or transaction scope is added here.

Interview questions and expected explanations:

1. Why exact decimals? Binary floating point can change financial values; explain
   exact string parsing, representational limits, rejection and USDT units.
2. How does a synchronous adapter fit a web server? Explain the proposed dedicated
   worker, bounded admission, ownership and the accepted future runtime extension.
3. What does a timeout or body cap guarantee? Explain the total HTTP budget and
   cap+1 reads, distinguishing configured bounds from DNS/OS timing and total memory.
4. What do offline tests prove? Explain injected transport/clock and failure
   precedence; they do not establish real TLS, network availability or freshness.

## Project B — Solana Secure Escrow

A separate future repository; no Solana implementation starts in W3.0. Proposed
learning targets are Solana accounts/instructions, Anchor, PDA derivation, SPL
Token handling, signer/authority validation, and explicit release/refund invariants.
Early development is limited to local test environments and test tokens.
No real assets, mainnet, production keys or audit-level assurance claims.

| Milestone | Independently verifiable result and review gate |
| --- | --- |
| B1 — Specify security model | After Project A is demonstrable, obtain approval for a separate repository and local-test-only scope. Define participants, account ownership, PDA seeds, token program/mint policy, authorities and state transitions. Specify conservation, authorized release/refund and terminal-state invariants before code. |
| B2 — Local escrow demonstration | Under an approved specification and dependency/toolchain review, implement the minimal deposit/release/refund flow and prove expected balances and states using reproducible local fixtures and test tokens. |
| B3 — Adversarial review | Test wrong signers, account/PDA/mint/authority substitution, repeated release/refund, invalid transitions and failed transfers. Verify failures leave balances/state consistent; document unresolved findings and review the exact commit before presenting it. |

Client/interviewer-ready evidence: pinned reproducible local setup and working
escrow demo; architecture/account/state diagrams; a trust-boundary and adversarial
security review; meaningful local automated tests and CI; documented PDA, authority
and token decisions; known token/program/environment limitations. Measure local
compute consumption where relevant and record tooling/workload; do not extrapolate
local measurements to mainnet. Security review is educational evidence, not an audit.

Interview questions and expected explanations:

1. Does a PDA establish authorization? No; explain derivation/ownership checks and
   separately required signer and authority checks for each instruction.
2. How are substituted token accounts rejected? Explain the approved token program,
   mint, account ownership and escrow authority constraints together.
3. What prevents double release or refund? Explain mutually exclusive terminal
   transitions, conservation of deposited test tokens and adversarial repeat tests.
4. What happens if a transfer fails? Explain transaction atomicity assumptions,
   how state/balance invariants are tested, and limits of local security evidence.

## Project C — Solana Transaction Indexer

A separate future repository demonstrating public Solana RPC/event ingestion,
Rust asynchronous processing, PostgreSQL persistence, idempotency and recovery,
transaction commitment/finality handling, observability and reproducible tests.
Project A's adapter remains blocking; its proposed web application runtime is
separately reviewed through ADR 0003.

| Milestone | Independently verifiable result and review gate |
| --- | --- |
| C1 — Specify ingestion and storage | After Project A is demonstrable, approve repository scope, bounded ingestion/backfill, event identity, schema, commitment policy, checkpoints and recovery contract. Review Rust async/RPC/database dependencies and resource limits before implementation. |
| C2 — Replayable local pipeline | Implement under approved scope using captured synthetic RPC fixtures and isolated PostgreSQL. Demonstrate ingest, query and restart with deterministic duplicate, out-of-order and interruption scenarios. Mandatory tests require no live RPC or production credentials. |
| C3 — Recovery and performance evidence | Demonstrate atomic data/checkpoint persistence, idempotent replay, RPC gaps and commitment transitions under the approved policy. Measure throughput, lag and resource use for a stated local workload; verify bounded queues/backpressure, safe diagnostics and CI at the reviewed commit. |

Client/interviewer-ready evidence: reproducible setup including disposable local
PostgreSQL; a working replay/restart demo; architecture explaining RPC, queues,
transactions and checkpoints; security review of untrusted RPC, database access
and logs; meaningful recovery/failure tests and CI; documented identity, schema
and commitment decisions; known RPC history/coverage and finality limitations;
measured workload-specific performance. Use local-only test database access and
synthetic data; future external endpoints, authentication and secrets require
separate scope and controls.

Interview questions and expected explanations:

1. How are duplicates handled after restart? Explain stable event identity, database
   uniqueness and transactional writes/checkpoints; avoid unsupported exactly-once claims.
2. What if the process crashes during persistence? Explain atomic commit boundaries,
   replay from the last committed checkpoint and deterministic interruption tests.
3. Is an observed transaction final? Explain the selected commitment policy,
   provisional state and reconciliation when observations are replaced or disappear.
4. How does the indexer handle slow storage or RPC gaps? Explain bounded queues,
   backpressure, approved retry budgets, resumable backfill and visible incompleteness.

## Shared portfolio acceptance and learning mechanism

Each project must satisfy its evidence packet above before being described as
client/interviewer-ready. Setup must work from a clean checkout; demo instructions
must include expected results and a failure path. CI must identify the tested
commit. Decisions and limitations must agree with behavior. Measurements need
commands, environment, workload and results, not unsupported performance claims.
Each project includes the three-to-five explained interview questions above;
revise answers against the implemented design before publication.

For each milestone, propose one concise learning note attached to its review:

1. Architecture explanation: inputs, outputs, boundaries and a small diagram if useful.
2. Important implementation decisions: alternatives, rationale and evidence.
3. Failure modes and security: attacker-controlled inputs, invariants, controls and gaps.
4. Interview questions: three to five questions with explained answers from the change.
5. Independent understanding: identify what the human should explain, trace, modify
   and debug without AI; record a short walkthrough and unresolved learning gaps.

Keep this lightweight in Markdown review material; no code, generator, new harness
or automation is introduced now. AI assistance and independent understanding must
be represented honestly. Human acceptance closes each milestone; the next phase
requires its own scope approval.

## Risks, prerequisites and boundaries

- W3.0 adds no runtime trust boundary or dependency. It adds a risk of overstating
  capability: separate goals from verified artifacts, historical evidence from new
  checks, and educational review from audit assurance.
- Adapter AC8 isolation evidence, AC10 human closure, current-commit hosted CI and
  permitted provider availability remain prerequisites/gaps to resolve for Project A.
- Escrow adds account, signer, token and authority boundaries and funds-loss risks
  even in a test model. A separately approved local-only specification, compatible
  pinned tools/dependencies and adversarial invariants are prerequisites. This
  repository's prohibition on signing/blockchain execution is unchanged; future
  local test signing needs explicit approval in that repository, never real keys.
- Indexing adds untrusted RPC, durable storage and async resource boundaries.
  Define rate/resource limits, transaction/recovery semantics, commitment policy,
  local database isolation and secret handling before implementation.
- Sequence B/C only after Project A is demonstrable; choose their order at review
  according to demonstrated learning needs. Neither is authorized to start now.
  No fixed dates, hiring outcomes, production readiness or audit guarantees are made.

## W3.0 document acceptance checks

Verify this roadmap and context cover the requested objective, three roles,
professional positioning, three projects, project-specific quality evidence,
explained interview questions, learning notes and incremental gates. Resolve
local links, inspect the diff, preserve existing specifications/ADRs/security
requirements and confirm only the two intended Markdown files changed. W3.0
is human-accepted; this does not establish complete adapter acceptance or authorize
implementation of the roadmap.
