# Production preparation validation — 19 November 2026

Scope: separate empty production installation, device-bound access, recovery and
explicit launch control. Public evaluation remains active until a later approved
Go. This report is evidence for software behavior, not event acceptance.

## Local results

- 86 Node tests passed (including 14 production provisioning/access/revocation/
  restore tests the evaluation-draft isolation regression and cached-evaluation-tab write fence).
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
- Self-host build and TypeScript passed. Hosted build also passed after the
  final UI/status wording change; CI records the final exact-head checks.
- Production dependency audit: 11 unresolved advisories (0 critical, 4 high,
  4 moderate, 3 low); see [reachability review](dependency-review-2026-11-19.md).

Local Node 22.23.2 / SQLite 3.53.4 on macOS under Rosetta; browser/server fixtures
own disposable databases and never mount or write to the prepared production DB.
The private Ubuntu candidate runs Node 24.22.3 / SQLite 3.54.1, WAL and FULL
synchronous mode, with no public port. Candidate image:
`sha256:4ff20ab50082c05bd48824179c901ca0e35c6447a510bb0b63ca1a79e4db6ea0`;
runtime revision `33bab6a663482d217d97e43f6e4958d8344e545b`.

## Private intended-server preparation

A separate volume/key now contains one prepared event, six cashier accounts, one
manager and seven unconsumed device invitations. All financial/operation tables
are empty; one setup audit entry is expected. Production writes remain paused.
The imported evaluation route and six existing container images/start times were
verified unchanged. Public access still returns the evaluation authentication gate.

The separate candidate Caddy configuration validated without a reload. A false
approval template was refused and created no launch record. Server and Mac
five-minute backup channels were installed independently of evaluation. A fresh
off-host snapshot passed SHA/integrity/ledger checks. Its isolated restore
retained the matching installation, changed epoch, paused writes, revoked all
devices/sessions and successfully verified a cashier verifier using the separately
preserved key without exporting any real PIN. See the [restore proof](restore-production-proof-2026-11-19.json).
The restored test copy was deleted after verification.

The initial read-only snapshot before application startup could not create WAL
sidecars. Starting the prepared service and retrying the backup resolved it;
subsequent server/Mac verification passed. Provisioning remains financially empty.

[PR #9](https://github.com/codeWithDEI/BasarKasse/pull/9) records the final intended-server
quota workload status/counters as release-review evidence. The persistent-storage
workload uses a
separate no-network container, one CPU/768 MiB, 10,000 seed receipts and six then
twelve simulated sessions. Neither its database nor its fixture key is the
prepared production volume/key. It does not close the four-hour/field gates.

A separate 15-minute CPU/control-flow run used tmpfs storage: 681 new sales,
76 exact replays, seven voids, 150 payouts, independent ledger reconciliation,
restart and restore fencing passed. These latency numbers do **not** measure
the host disk. It is recorded separately from the repeat on a dedicated host
filesystem scratch directory (`TMPDIR=/scratch`), on the same filesystem as
the production volume but with no production volume mounted. The final
persistent-storage result is recorded in PR #9.

The exact runtime candidate passed [GitHub validation](https://github.com/codeWithDEI/BasarKasse/actions/runs/44615361639);
later documentation-only evidence changes do not change its executable tree.

## Remaining acceptance

Physical tablets/camera/native lock/storage behavior, venue Internet and realistic
WAN/proxy throughput remain open. Organizer forecast, four-hour rehearsal target,
opening cash, real team assignment, technical/cash owners and fallback, dependency
risk decision, encryption/retention and backup loss-window policy still need
explicit acceptance. A prepared container and passing synthetic tests do not
close these gates. No real-money launch was authorized by this preparation.


## Event configuration correction

The owner clarified after PR #9 that the 21 November event is a **toy bazaar with
two tills**. Six tills belong to a later baby bazaar. The six/twelve-client results
above remain workload evidence; they are not a requirement to run six tills on
Saturday. The prepared event is being corrected through setup-only commands, with
unneeded provisional cashier accounts disabled and their unused device grants
revoked. A distinct event-manager account/device grant provides notebook support
and health access without opening or consuming a till. Public activation remains
separately gated; financial tables must remain empty.
