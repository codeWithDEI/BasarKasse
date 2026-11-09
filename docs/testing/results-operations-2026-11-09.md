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
- The short soak harness check independently reconciled 72 new sales, 13 duplicate
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

Versioned backup tools at `b856b3bc353f3f7951f5e1421469cb94047b3924` are mounted
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

The same versioned toolkit also produced an [isolated Ubuntu restored
copy](restore-ubuntu-proof-2026-11-09.json): integrity passed, the 3 events,
5 receipts, 1 payout, 14 operations and 15 audit rows were preserved, a new epoch
was assigned and writes remained paused. Neither drill replaced the active volume.

## Ubuntu duration run

The [one-hour Ubuntu workload](results-ubuntu-soak-2026-11-09.json) **passed** on
9 November, 14:26–15:27 UTC, in a separate no-network container with its own
database and private disk-backed scratch directory. The protected evaluation
database was not used. The tested application revision is `4548c8a`, Node.js
24.22.2 / SQLite 3.53.4, with effective cgroup limits of one CPU and 768 MiB.
The portal remained running on the same host.

The fixture started with 10,000 receipts plus operation/audit history. Six personal
cashier sessions operated for 45 minutes, then twelve for 15 minutes, sharing six
tills. Each active client submitted a five-item sale every ten seconds and read
the compact state. Duplicate replays, manager movements/voids and online backups
ran during traffic. Final settlement, restart and isolated restore checks were
included in the total 3,624 measured seconds.

| Measurement | Result |
| --- | --- |
| New sales / persisted receipts | 2,706 / 12,706 |
| New sales in six-client / twelve-client phase | 1,625 / 1,081 |
| Primary sale HTTP responses | 2,706 HTTP 200; no failures |
| Duplicate replays / voids / cash movements | 277 / 29 / 238 |
| Individual seller payouts / counted till closures | 150 / 6 |
| Booking response p50 / p95 / p99 / maximum | 153.9 / 983.4 / 1,127.9 / 1,316 ms |
| Compact-state refresh p95 | 670 ms |
| Initial / final compact snapshot | 91,181 / 105,938 bytes |
| Integrity, restart replay, paused restore and old-tablet fence | All passed |

The p95 and p99 meet the proposed **server-response** thresholds for this workload.
The p95 is close to one second; this is not evidence of unlimited spare capacity
or a measured end-to-end tablet/WAN response time.

The additional [independent Python ledger check](results-ubuntu-ledger-2026-11-09.json)
uses a read-only post-closure snapshot and no application money helpers. It checked
all 12,706 fixture receipts, 2,706 new command fingerprints, 29 voids, 238 movements,
each of the 150 sellers' gross/commission/net amounts and all six cash balances.
Net payouts were 5,429,947 cents and final cash was 1,081,613 cents. It also rejected
deliberately offsetting one-cent payout errors on the same till, which would leave
the combined cash total unchanged. No lost or duplicate financial effect or
unexplained balance difference was found.

[Resource observations](results-ubuntu-resources-2026-11-09.json) recorded a maximum
observed cgroup lifetime memory peak of 400,539,648 bytes (382 MiB) against the
768 MiB limit. Sampling began partway through the run and ended before shutdown;
the figure is the maximum observed kernel peak, not a guarantee about every final
instant. The driver and app share the measured budget. Both the workload and the
independent checker exited successfully; their finite test containers are stopped.

## Limits that remain

No physical tablet screen lock/keyboard, venue WLAN/WAN, full host loss, disk-full
or power-cut behavior is certified. One hour is below the proposed four-hour
acceptance rehearsal and is not twice an agreed organizer forecast. The separate
driver and application share the tested CPU/RAM budget; browser polling is modeled
by after-sale reads rather than its own 12-second timer. The Mac must be awake and
connected; at-rest encryption and a spare-host plan are not proved by filesystem
permissions and a working SSH transfer. Production account provisioning/PIN
lifecycle and the organizer's actual release sign-off remain open.
