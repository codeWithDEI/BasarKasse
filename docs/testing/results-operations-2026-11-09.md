# Event operations verification — 9 November 2026

Scope: indexed command queries, unique receipt/open-till rules, compact/paged UI,
Ubuntu/Mac backup schedules, dashboard and isolated restore fencing. Evaluation
only; this is not release approval for real money.

## Completed local checks

- 52 regression tests passed: 6 domain, 4 HTTP, 8 register-state, 24 service,
  2 concurrency, 2 API/error-classification and 6 operations tests.
- Next.js self-hosted build, Vinext hosted build and TypeScript checks passed.
- 38 browser tests passed in 38.2 seconds: 19 scenarios per Chromium/Android-tablet
  and WebKit/iPad layout, including full-event search/export with 50-row paging,
  manager-only dashboard and loss of a previously green health connection.
- The short soak harness check independently reconciled 78 new sales, 13 duplicate
  replays, 125 seller payouts, six exact till closures, restart replay and restored
  epoch/write-pause checks. That ten-second harness check is not a duration test.

The [local six-session HTTP report](results-operations-local-2026-11-09.json)
contains 5,000 seeded and 600 new sales, all HTTP 200, 61 matching replays, exactly
5,600 unique persisted receipt numbers, correct operation/audit counts and
2,835,500 cents independently reconciled. Booking p95 was 216.9 ms and elapsed
traffic time 27.412 seconds. This local check deliberately retains the legacy full
snapshot; it does not measure the new compact browser payload or Ubuntu limits.

## Deployed evaluation and off-host drill

The protected demo runs application revision
`4548c8abc70e5e48cf4874030630f9a362be869e`, image
`sha256:7187e772dd37dfcc76e4e7fe9a227aeb237dad740fb7d26a03fae2a2a415ce2c`.
Its own CPU/RAM limits remain one CPU / 768 MiB. The existing portal and analytics
containers were not restarted. HTTPS checks confirmed 401 without the outer
access credential, 200 for the protected dashboard and manager health API, correct
Secure session cookies and an initially green dashboard with fresh server/Mac
backup evidence.

Versioned backup tools at `a492fa83fb70746288c30127069ae262c57f7431` are mounted
read-only into the separately limited utility container. Ubuntu systemd and the
Mac LaunchAgent both run at five-minute intervals. The Mac requests a fresh
snapshot before each pull, verifies it locally and returns a matching digest
acknowledgement. Multiple scheduled pulls succeeded; the confirmed timestamp is
the snapshot timestamp, not merely the time an old file was copied again.

The [actual off-host restore proof](restore-proof-2026-11-09.json) uses one of
these protected **synthetic evaluation** backups copied to the Mac. It was restored
and migrated to a new temporary Next.js/SQLite instance on the Mac. Source SHA-256,
financial row counts, item sums and foreign keys were preserved. The copy started
write-paused; an unknown pending operation was blocked before release, and both
old explicit and legacy missing epochs remained blocked after release. A current
epoch status lookup worked without making a financial change. The live database
was not replaced. Separate operations tests verify old sessions are invalidated
on the restored copy; no original backup is changed.

## Ubuntu duration run

A separate, no-network staging container is running the one-hour workload from
`test-register-soak.mjs` against its own database and private scratch directory.
The application revision and effective cgroup limits are recorded in the report.
It starts with 10,000 receipts plus operation/audit history, six personal sessions
and a final twelve-session reserve phase on six tills. Final duration, latency,
reconciliation and restore/restart outcomes will be recorded after completion.
Until then the duration test is **in progress**, not a passed capacity gate.

## Limits that remain

No physical tablet screen lock/keyboard, venue WLAN/WAN, full host loss, disk-full
or power-cut behavior is certified. One hour is below the proposed four-hour
acceptance rehearsal and is not twice an agreed organizer forecast. The separate
driver and application share the tested CPU/RAM budget; browser polling is modeled
by after-sale reads rather than its own 12-second timer. The Mac must be awake and
connected; at-rest encryption and a spare-host plan are not proved by filesystem
permissions and a working SSH transfer. Production account provisioning/PIN
lifecycle and the organizer's actual release sign-off remain open.
