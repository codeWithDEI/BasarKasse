# Event teams and pooled settlement — 10 November 2026

Application revision: `6d9a03e30926c83128825b05a830f97a17d93f03` (based on
merged main `ce0fb37`). Later report/metadata edits do not change application code.
Scope: the [10 November requirements](../requirements/2026-11-10.md), including
assigned cashiers, encrypted manager PIN display, fifty-cent article input,
counted pool settlement and ten-cent payout rounding. **Evaluation only.**

## Regression and browser results

- **68 Node tests passed:** 22 domain/HTTP/register-state, 36 service/workflow,
  two concurrency and eight API/operational tests. No skipped or failed cases.
- TypeScript checking, the Next.js self-hosted production build and the Vinext
  hosted build passed. A local typecheck initially encountered identical duplicate
  generated `.next/types/* 2.ts` files; removing those generated copies and
  regenerating types passed without a source change.
- **50 Playwright tests passed**, 25 per Chromium Android-tablet and WebKit iPad
  layout, one worker, zero retries, 3.2 minutes. Disposable Next.js/SQLite server.
- Management/team and pooled-settlement screenshots were visually checked at
  desktop and 1024-pixel tablet width; PINs remained hidden.

The workflow tests cover assigned event/till full and compact reads, own-till
turnover/export, unauthorized commands, fifty-cent validation, per-seller rounding,
insufficient cash and competing payouts, one counted contribution per till,
rollback after contribution failure, historical-schema upgrade and session
revocation. Commit-time staff-version and login-insertion guards are exercised
against simultaneous reassignment/PIN reset. PINs are absent from normal state,
browser storage and financial operation records.

Browser cases cover assigned personal links, locked selectors, numeric article
entry, team creation/editing/PIN privacy, count-before-payout, float withdrawal,
and recovery using the original person after a different cashier signs in.
Existing request/reply-loss, reload/tab, expired-session, storage failure,
contention and wake-up scenarios also pass. Old euro drafts retain their value;
unknown obsolete pending commands are checked without blindly sending a sale.

These are emulated browser engines, not physical screen-lock or venue tests.
The existing lint baseline is still separate maintenance debt; this report does
not claim a clean repository-wide lint result.

## Six-session HTTP workload

The [HTTP report](results-event-workflow-load-2026-11-10.json) records six distinct
assigned cashier accounts, 5,000 seeded receipts and 600 new five-item HTTP sales.
All **600 returned 200**. **61 exact replays** and a restart replay preserved the
original result. The final **5,600 receipts** matched the independently expected
**3,203,000 cents**. Receipt uniqueness, new audit/operation counts, SQLite integrity
and foreign-key checks passed.

Measured traffic took 8.285 seconds; booking p95 **65.1 ms**, refresh p95
**55.8 ms**. Seed rows bypass the API. Timings are diagnostic for this local
workload, not a production throughput guarantee.

## Pooled settlement and independent ledger

The [soak report](results-event-workflow-soak-2026-11-10.json) records **130 seconds
of traffic** at one sale per second per client: six clients for the first 97.5
seconds, twelve for the remaining phase. The complete measured run including
settlement/restart/restore took 144 seconds. It seeded 10,000 receipts and committed
**972 new sales** (588/384 by phase), with **103 replays**, one void and eight
cash movements. All initial sales returned 200. Booking p95 **69.2 ms**, p99
**77.6 ms**; refresh p95 **60.9 ms**.

All six tills were counted/closed before **150 pool-funded seller payouts**.
The [independent Python/SQLite report](results-event-workflow-ledger-2026-11-10.json)
uses submitted fixture intents and read-only stored rows, without importing the
application's money helpers:

| Check | Verified result |
| --- | --- |
| Receipt/item reconstruction | 10,972 receipts |
| New command SHA-256 fingerprints | 972 |
| Goods / checkout donations | 6,381,000 / 54,855 cents |
| Commission | 957,150 cents |
| Individual payouts | 150, totaling 5,423,360 cents |
| Separate payout-rounding donation | 490 cents |
| Counted tills / unique pool contributions | Six / six |
| Final pool cash | 1,072,495 cents |
| Compensating per-seller payout errors | Detected despite unchanged combined cash |

Integrity, restart replay, isolated backup/restore, restored-session invalidation
and old-tablet epoch fencing passed. The short run does not reach the five-minute
online-backup interval; final backup/restore was exercised. The raw synthetic
fixture is private and is not committed alongside these aggregate reports.

## Runtime and limits

Both HTTP runs used local macOS, x64 Node **22.23.2** under Rosetta, SQLite
**3.53.4**, 12 logical CPUs and 24 GiB RAM. There were **no Ubuntu/container CPU or
memory quotas, portal co-load, HTTPS proxy or actual venue network**. The soak's
resource-description metadata was clarified after execution; numeric measurements
are unchanged. The one-hour [9 November Ubuntu run](results-operations-2026-11-09.md)
belongs to the earlier workflow and is not validation of this new pool policy.

Still required: intended-server verification of this revision, the agreed
four-hour/forecast workload, real Android/iOS screen lock and reconnect, venue
Internet, power/storage faults and organizer cash-process approval. Production
bootstrap, removal of public demo access and central manager recovery remain
open in [production readiness](../production-readiness.md).

Before deployment, follow the [upgrade/key/toolkit instructions](../operations/event-teams-and-settlement.md).
Existing events keep their historical till/cent policy; create a **new** event
for pool settlement. The entire counted contents including floats enters the
pool; return floats through documented withdrawals. No historical payout is
recomputed and no deployment was performed for these local checks.
