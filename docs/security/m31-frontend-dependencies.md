# M3.1 frontend dependency review

Review date: 2026-10-19. Scope: local Windows x64 implementation only. The Product
Owner approved exactly the 13 direct pins in frontend/package.json. No additional
direct dependency, lifecycle execution, native build or package upgrade is approved.

## Toolchain provenance

Before: Node v24.18.0, npm 11.16.0, codex-cli 0.163.0.
After: Node v24.22.0 LTS (Krypton), bundled npm 11.19.1, codex-cli 0.163.0.
The official https://nodejs.org/dist/index.json lists this release on 2026-10-14
with npm 11.19.1 and Windows x64 artifacts. Downloaded only the official
https://nodejs.org/dist/v24.22.0/node-v24.22.0-x64.msi and compared SHA-256 against
https://nodejs.org/dist/v24.22.0/SHASUMS256.txt before running it:

`97ebad47ad35da4b59182a5fbe9fad2b1a1836f1042b4833ff5b4b9571175088`

Authenticode status was Valid, signer OpenJS Foundation. MSI exit was 0. The
existing installation was updated without a restart. Effective paths remain
C:/Program Files/nodejs/node.exe, C:/Program Files/nodejs/npm.ps1, and
C:/Users/victo/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe. No global Codex
configuration/model selection or npm upgrade command was used. A complete OS
configuration comparison is not claimed.

## Exact direct dependencies

| Kind | Package | Version |
| --- | --- | --- |
| Production | react | 19.3.1 |
| Production | react-dom | 19.3.1 |
| Development | typescript | 6.0.3 |
| Development | vite | 8.3.4 |
| Development | @vitejs/plugin-react | 6.1.2 |
| Development | vitest | 5.0.5 |
| Development | @testing-library/react | 16.3.3 |
| Development | @testing-library/dom | 10.4.2 |
| Development | @testing-library/user-event | 14.6.8 |
| Development | jsdom | 30.1.3 |
| Development | @types/react | 19.3.0 |
| Development | @types/react-dom | 19.3.0 |
| Development | @types/node | 24.19.2 |

## Resolution and integrity gate

The Coordinator prepared the exact manifest and ran
`npm install --package-lock-only --ignore-scripts --no-fund --prefix frontend`.
No installed graph was executed before review. The lock records 121 non-root
package entries: 13 direct and 108 transitive, including platform optionals.
`npm ls --package-lock-only --all --prefix frontend` exited 0. Required peer ranges
are satisfied; uninstalled optional peers are intentional. No React Compiler,
canvas, browser test harness, telemetry peer or extra direct package was installed.
jsdom has a transitive decimal.js dependency; application financial code does not
import or use it.

The independent QA/Security subagent queried metadata for all 121 exact registry
versions with four bounded lightweight requests at a time. Version, tarball URL,
SHA-512 SRI and license matched all 121 lock entries, with no query failure. Every
source is a registry.npmjs.org HTTPS tarball. Declared Node engines accept 24.22.0.
This is metadata/provenance review, not an exhaustive package source audit.

`npm audit --package-lock-only --json --prefix frontend` exited 0 with zero known
vulnerabilities at all reported severities. No force, legacy-peer-deps, advisory
ignore or automated audit fix was used. Registry advisories are a dated snapshot,
not proof of absence of vulnerabilities.

## Scripts, native packages and platform

Rolldown 1.2.14 and Lightning CSS 1.33.0 provide prebuilt Windows x64 MSVC bindings:
@rolldown/binding-win32-x64-msvc and lightningcss-win32-x64-msvc. These packages
require no installation scripts or local native build. Binary provenance is
limited to registry SRI and package metadata; reproducible native builds, binary
source correspondence and independent signatures were not verified.

The only lock entry marked hasInstallScript is fsevents 2.3.3, whose node-gyp
rebuild hook is Darwin-only optional. It is absent from the Windows installation.
Registry prepare metadata exists for jsdom, lightningcss, lru-cache, tinyexec,
undici and whatwg-url; none was executed. All installations use --ignore-scripts.
Project-local frontend/.npmrc also sets ignore-scripts=true, engine-strict=true
and the official npm registry. No global configuration is changed.

`npm ci --ignore-scripts --no-fund --engine-strict --prefix frontend` succeeded:
96 physical packages (13 direct + 83 transitive), 97 audit entries including root.
The difference from 121 locked entries is platform-specific optional omission.
The lock SHA-256 remained unchanged across ci:
`939179b346b26e6fbcf7cde444785622a11fa66192d07d72bff1251885753580`.

Declared license counts across 121 entries: MIT 94; MPL-2.0 12; Apache-2.0 5;
BSD-2-Clause 2; BSD-3-Clause 2; ISC 2; MIT-0 2; BlueOak-1.0.0 1; CC0-1.0 1.
Lightning CSS and its platform packages declare MPL-2.0. Vendor notices remain in
node_modules; no publication/distribution or legal clearance is claimed here.
No Rust dependency, Cargo feature, native Rust source or lockfile changed.

## Security boundaries and remaining evidence gaps

New boundaries are package installation/execution, untrusted browser responses,
and browser -> Vite -> Rust HTTP requests. Controls are script-disabled exact-lock
installation, bounded strict decoders, relative native fetch, early exact Host
validation, loopback/fixed ports, sensitive-file denial and fixed API proxy routing.
Origin is preserved for Rust validation, never rewritten for admission. The
production/development Origin policies are mutually exclusive.

The Vite development CSP allows inline styles for its local CSS injection; scripts
and connections remain self-only. HMR, WebSocket server, console forwarding and
permissive CORS are disabled. These controls do not authenticate hostile local
processes. Actual-server test evidence is recorded in the M3.1 implementation
report and specification. Browser rendering, Windows/Linux clean-checkout parity,
OS-enforced network isolation, native binary audit and continuing advisory
monitoring remain separate work. No live provider request is part of this review.

## Git checkpoint revalidation (2026-10-19)

The exact13direct pins, all121lock entries/108transitives, official registry SRI,
licenses, engines, required peers, lifecycle metadata and platform bindings were
rechecked before publication. Script-disabled strict-engine npm ci again installed
96Windows packages, with fsevents absent and the recorded lock SHA256 unchanged.
npm audit --package-lock-only --json again exited0 with zero known findings; no
upgrade, package version change or script execution. Both TypeScript configurations
also passed declaration checking via --skipLibCheck false without config changes.
This does not expand the earlier metadata/native-binary/advisory assurance limits.
