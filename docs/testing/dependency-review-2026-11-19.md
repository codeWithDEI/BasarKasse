# Dependency review — 19 November 2026

`pnpm audit --prod --json` reports **0 critical, 4 high, 4 moderate, 3 low**.
Versions/lockfile are unchanged from the protected evaluation baseline. This is a
reachability triage, not proof of absence of vulnerabilities or an accepted risk
on behalf of the organizer. The full audit was retained in private release evidence.

| Dependency / severity | Audit path and reported trigger | Application assessment |
| --- | --- | --- |
| `browserslist` 4.28.2, two high | Next → styled-jsx → Babel compilation targets; distinct browser queries exhaust cache, untrusted stats can crash/write prototypes. Patched >=4.28.7. [Cache](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [stats](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | No cash API accepts browser queries/stats; normal source/config inputs are repository-controlled. Dependency remains in the image. |
| `source-map-js` 1.2.1, high | Next → PostCSS; indexed-map offsets can block the event loop. Patched >=1.2.2. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | No application upload/source-map API; build/source-map input is repository-controlled. Not demonstrated remotely reachable through cash commands. |
| `zod` 3.25.76, high | Direct dependency and form resolver; constrained oversized collections can exhaust memory. Audit patch threshold >=4.6.6. [Advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Only authored import is `zod/v4` in hosted connector scaffolding (`lib/connector-errors.mts`); cash API/service do not use Zod. Production Next profile has no connector route. A major dependency change was not mixed into launch preparation. |
| `baseline-browser-mapping` 2.10.30, moderate | Browserslist compilation targets; invalid input can terminate process. Patched >=2.11.0. [Advisory](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | Same controlled build-input boundary; no cash endpoint accepts browser target definitions. |
| `fast-uri` 3.1.7, three moderate/two low | Form resolvers → AJV/ajv-formats; URI normalization/scheme/host ambiguities. Audit patch thresholds up to >=3.1.9. | No authored cash route uses AJV URI validation to authorize or fetch a URL. No evidence of an affected cash path; the dependencies are still shipped. |
| `@babel/core` 7.29.0, low | styled-jsx compilation; crafted sourceMappingURL can read files. Patched >=7.29.6. [Advisory](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | Cash users cannot submit source code/configuration to the build. Repository contributors/build inputs remain trusted. |

These are inferences from the installed dependency graph and authored import/API
review. They do not establish that every transitive runtime path is unreachable.
The production access boundary adds trusted-device enrollment and existing JSON/
item limits; it is not a general denial-of-service mitigation. Record an explicit
release risk decision, then update compatible packages/remove unused scaffolding
and reduce the runtime image in a separately verified change. Re-run the audit
for every new release; do not copy this count as a future clean-security claim.
