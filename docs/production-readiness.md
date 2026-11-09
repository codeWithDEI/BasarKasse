# Production readiness: six cash registers

**Decision today: evaluation only; no approval for real money.** The current
transaction model has useful safeguards, but recovery, contention and operational
acceptance remain incomplete. A working demo and green unit tests do not close
these gates. Assign an owner and attach evidence for every row before approval.

Target event: **21 November 2026**. [Register recovery](operations/register-recovery.md)
is the current priority; no automatic live approval follows from its implementation.

## Priority 0 — required before a live bazaar

| Gate | Work required | Evidence for acceptance | Current status |
| --- | --- | --- | --- |
| PR-01: uncertain sale recovery | One durable browser command/receipt state machine; operation status endpoint; consistent scope and payload identity; preserve IDs through retryable errors | Interrupt browser/network at every stage before/after commit; each intended sale occurs once and the cashier sees its confirmed outcome | Software controls implemented; 32 browser scenarios across two engines, including low-friction PIN recovery; physical-device acceptance open |
| PR-02: contention handling | Replace the five-attempt cliff with measured bounded retry/backoff or another explicit serialization strategy; classify busy/timeout failures | Six synchronized registers and mixed manager commands: no partial or duplicate writes, no unresolved user outcome | Implemented bounded same-ID client retries and twelve server attempts with jitter; intended-server soak in progress; four-hour/device acceptance open |
| PR-03: bounded work | Targeted command reads, indexed aggregates and paginated history; explicit full exports remain | End-of-day and double-forecast datasets meet agreed response targets under simultaneous register traffic | Implemented; 50-receipt pages with whole-event totals; 10,000-sale Ubuntu soak in progress |
| PR-04: database invariants | Unique event receipt numbers and open till numbers; consistent operation scope; stable actors and validated migrations | Concurrent open/sale/payout/close/void tests; old-data upgrade and rollback/restore drill | Implemented unique receipt/open-till constraints and indexes; migration refuses conflicting history; restore fencing tested |
| PR-05: production access | Explicit production bootstrap, no demo accounts/login; staff lifecycle, PIN change, revoke sessions, manager recovery; define cashier data access | New production database has no default credentials; permission and recovery tests pass | Open |
| PR-06: recoverable operations | Automated consistent off-host backups, retention/encryption/access policy, monitoring and tested spare-host recovery | Restore a backup onto a separate instance, replay/reconcile receipts and measure recovery time/loss window | Scheduled verified Ubuntu/Mac copies, health dashboard and actual off-host restore/epoch drill implemented; loss-window and spare-host sign-off open |
| PR-07: six-device acceptance | Actual tablets, Wi-Fi, HTTPS proxy, intended server quotas, realistic event history and prolonged traffic | Signed rehearsal report including interruptions, reconciliation and operator training | Open |
| PR-08: ownership and cash process | Named technical lead/deputy, event manager, cash reconciliation, incident fallback and confirmed organizer requirements | Organizer signs readiness checklist; no critical unresolved risk | Open |

Fixing these gates should be small reviewed changes with regression evidence;
do not combine a broad UI rewrite and a new transaction protocol immediately
before the event. A new database alone does not close PR-01 or PR-07.

## Proposed acceptance envelope — agree before implementation

These are **targets**, not measured guarantees. Replace them with the organizer's
actual forecast and record the final values in the release checklist.

- Six real registers; test twelve simulated clients as a capacity margin.
- At least 5,000 historical sales / 25,000 items, or twice the expected full-day
  data volume, whichever is larger. Include realistic voids, payouts and movements.
- Four-hour rehearsal at twice the forecast sustained checkout rate. Include
  synchronized six-sale bursts, background reads and manager actions.
- Under normal conditions, booking response p95 <= 1 second and p99 <= 2 seconds
  on the intended hardware/network. Record the refreshed-screen time separately.
- Zero lost acknowledged sales, duplicate financial effects, partial transactions,
  duplicate payouts, negative unexpected till balances or unexplained receipt gaps.
  Every rejected request has a clear safe outcome and preserves the correct ID.
- Exercise process kill, reply loss, browser reload/closure, session expiry,
  Wi-Fi interruption, disk-full behavior, backup under load and a restored spare.
- Proposed recovery objective: restart/restore within 15 minutes. Agree the
  off-host backup interval/loss window explicitly. A five-minute backup interval
  can still lose up to five minutes after host loss; it does not meet zero-loss
  recovery by itself. If that is unacceptable, design additional durability.

Do not extrapolate local requests/second into an event guarantee. The local HTTP
check does not model shared portal load, device rendering, WAN/Wi-Fi, storage
failure, proxy behavior or power loss. See [recorded results](testing/results-2026-11-08.md).

## Priority 1 — maintainability and sustained operation

Split the UI and booking/auth/query modules, introduce typed action/result/error
contracts and an injected persistence interface. Establish a clean lint baseline,
independent accounting oracle/property tests, adapter conformance tests and
browser automation. Reduce the image to required runtime dependencies; pin and
record release images and runtime SQLite versions. Add structured non-sensitive
metrics for latency, conflicts, unknown operations, backup age, disk and restarts.
Triage dependency advisories rather than using audit counts as a safety claim.

Decide license, contribution policy, maintainers, security reporting and supported
runtime. Record deployment-specific limits. Plan data retention and archival
without deleting replay protection for pending clients.

## Release sign-off

A release record must name the exact revision/image, applied migrations, dataset,
server limits, test results, known risks, backup location and successful restore,
network/device rehearsal, operator contacts and rollback plan. Technical and event
owners approve it together. Keep training and live deployments/data/access separate.
Until then, continue using synthetic data only.
