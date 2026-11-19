# Production preparation validation — 19 November 2026

Scope: separate empty production installation, device-bound access, recovery and
explicit launch control. Public evaluation remains active until a later approved
Go. This report is evidence for software behavior, not event acceptance.

## Local results

- 85 Node tests passed (including 13 production provisioning/access/revocation/
  restore tests and the evaluation-draft isolation regression).
- Five Python deployment tests passed: candidate-only validation, invalid/stale Go,
  changed route/nonempty DB/stale backup refusal, ordered success and failure
  preserving data while pausing writes/restoring the previous route.
- 76 browser cases passed: 66 existing recovery cases plus ten production cases
  across Chromium (Galaxy Tab S9 emulation) and WebKit (iPad emulation).
- Production browser cases exercised one-use enrollment and lost Set-Cookie reply,
  PIN-only re-entry, wake/reload, lost committed sale reply, replacement-device
  recovery under the original actor/operation ID, strong manager password privacy
  and prepared health mode. Synthetic screenshots were visually inspected.
- Existing six-account HTTP workload: 5,000 seed receipts, 600 new sales and 61
  exact replays, 5,600 persisted receipts, integrity/ledger/restart checks passed.
  Local booking p95 57.7 ms, max 117.9 ms; this is unlimited macOS diagnostic timing.
- Production short workload: fresh synthetic production devices, six/twelve
  sessions, 720 sales after 100 seed receipts, independent tills/payouts/pool,
  restart replay and restored-device/epoch fencing passed. Ten-second duration
  is smoke evidence only, not sustained capacity acceptance.
- Self-host build and TypeScript passed. Hosted build is also required after the
  final UI/status wording change; CI records the final exact-head checks.
- Production dependency audit: 11 unresolved advisories (0 critical, 4 high,
  4 moderate, 3 low); see [reachability review](dependency-review-2026-11-19.md).

Local Node 22.23.2 / SQLite 3.53.4 on macOS under Rosetta; browser/server fixtures
own disposable databases and never mount or write to the prepared production DB.
The production profile is intended for Node 24 on Ubuntu. Server staging, quota
workload and backup/restore results will be appended after validation.

## Remaining acceptance

Physical tablets/camera/native lock/storage behavior, venue Internet and realistic
WAN/proxy throughput remain open. Organizer forecast, four-hour rehearsal target,
opening cash, real team assignment, technical/cash owners and fallback, dependency
risk decision, encryption/retention and backup loss-window policy still need
explicit acceptance. A prepared container and passing synthetic tests do not
close these gates. No real-money launch was authorized by this preparation.
