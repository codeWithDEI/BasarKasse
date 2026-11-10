# Testing and acceptance strategy

## Fast regression suite

```sh
pnpm test
pnpm run typecheck
```

The suite covers cent/commission rules, donations, role restrictions, sessions,
origin/cookie handling, transaction rollback, backup reopening, duplicate sales,
void/payout/closure checks and synchronized contention. Service tests compile the
real service with Vite and use the actual self-hosted SQLite adapter. They do not
exercise a remote D1 database or browser storage.

The six-register characterization test allows a 409 contention result and verifies
that explicit same-ID retry preserves exactly one sale. The service now uses
twelve attempts with jitter; the historical five-attempt result remains in the
dated report. **A passing characterization test does not mean the capacity gate passes.**
A second test sends competing seller payouts and checks the pool is debited once.
Recovery regression tests also cover immutable outcomes, changed-payload/actor
rejection, schema upgrade, legacy sale verification and unknown-error classification.

## Reproducible HTTP workload

```sh
pnpm run build:selfhost
LOAD_REPORT=/tmp/basar-load.json pnpm run test:load
```

Parameters:

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOAD_SEED_SALES` | `5000` | Historical sales inserted directly into the disposable database |
| `LOAD_SALES_PER_REGISTER` | `100` | New sales per session; six sessions are fixed |
| `LOAD_REPORT` | unset | Optional output JSON filename; generated report is otherwise stdout |

Run from the repository root. The script allocates a loopback port, starts the
built Next.js server, creates a synthetic six-till event, stops it to seed
history, then starts six sessions issuing sales and full refreshes. Five items
and a donation are recorded per sale. Every tenth sale is replayed with its
original ID; there is no hidden retry for failures. The script restarts the
server, checks persisted receipts/totals and a replay, and runs SQLite integrity
and foreign-key checks plus operation/audit counts for the measured new sales.
It deletes its temporary database/server logs. No external URL or existing
database is accepted. All six sessions use distinct personal accounts assigned to their till.

A failure exits nonzero. Timing is diagnostic; there is no calibrated CI timing
threshold. Seed rows bypass the API and do not contain complete historical audit
or operation records. New measured sales use the real HTTP route and service.
The replay check ignores an already received response; it does not inject a
network drop during commit. SIGTERM restart is not a power-cut test. Scheduled
12-second polling, real browser rendering and proxy
traffic are not included; the harness performs a full refresh after each sale.

Run both `pnpm run build:selfhost` and `pnpm run build` when shared runtime code
changes. Hosted D1 must have its own integration/capacity results before live use.
The workflow in `.github/workflows/ci.yml` runs regression tests, type checking,
both builds, the isolated HTTP check and browser recovery scenarios; it does not deploy.

## Browser interruption suite

```sh
pnpm run build:selfhost
pnpm exec playwright install chromium webkit
pnpm run test:recovery
```

On Linux use `pnpm exec playwright install --with-deps chromium webkit` to install
required system libraries. The fixed loopback test port 3138 must be free; the
runner refuses to reuse an existing server. All data is disposable.

The suite tests request/reply loss, reload/tab closure, session expiry, transient
409/503, tab ownership, storage failures before/after commit, interrupted item
entry and waking while an earlier reply remains suspended. Login scenarios
cover remembered staff, wrong PIN and retry, four-/eight-digit PINs, intentional
person changes with a draft, valid-session wake-up and original-person recovery
even when another account was last authenticated. Chromium uses an
Android tablet layout; WebKit uses an iPad layout. This is engine/emulation
evidence, not a real OS screen-lock or venue Wi-Fi certification. See
[recorded recovery results](results-2026-11-09.md) and the
[physical-device rehearsal](../operations/register-recovery.md).

## Acceptance cases still required

| Area | Scenarios and invariant |
| --- | --- |
| Browser recovery | Close/reload before send, during request, after server commit, after reply and while clearing storage. Preserve the same operation and original receipt; never resubmit a stale cart with a new ID. |
| Network | Drop request vs drop reply; offline/reconnect; high latency; repeated taps. No success before commit and no unknown cash outcome after recovery. |
| Authorization | Six different accounts, session expiry during a pending sale, account suspension/revocation, cashier access to management data and forged action fields. |
| Transaction races | Sale vs end-sales, close vs sale/withdrawal, void vs payout, duplicate staff/event commands and operation ID reuse with changed payload/scope. |
| Independent reconciliation | Independently derive every seller gross/commission/net and till expected balance from submitted fixtures, including voids/donations/transfers. Do not only call the production aggregation functions as the test oracle. |
| Storage/runtime | Kill around commit, busy timeout, disk full, failed migration, backup while writing, restore to another host and reconcile device pending state. |
| Capacity | Intended server/container quotas, portal co-load, twice forecast history/rate, prolonged traffic and synchronized bursts; measure p95/p99 and conflict rates. |
| Event workflow | Actual six devices over venue Wi-Fi, cash floats, change, corrections, withdrawals, seller payout and final physical counts with trained volunteers. |

These are release requirements tracked in [production readiness](../production-readiness.md),
not features already covered by automated tests. Attach actual runtime, revision,
workload, failure counts and independent ledger checks to every acceptance report.
The [9 November operations report](results-operations-2026-11-09.md) records the
completed Ubuntu run, browser/backup coverage and the remaining physical/fault gates.


## Isolated Ubuntu soak

`pnpm run test:soak` creates its own database and loopback server, seeds 10,000
receipts/items plus operation/audit history, creates twelve individual synthetic
cashiers sharing six tills, and runs for one hour. Six clients operate for the
first 45 minutes; twelve operate for the last 15. Each active client submits a
five-item sale every ten seconds, reads the compact state, and replays every tenth
command. The manager adds/removes cash every 30 seconds and voids a sale every two
minutes. Online backup checks occur during load. Counted closures and pool payouts with separate ten-cent rounding, stored receipt numbers, sale operation/audit counts and expected cash
are checked against a separately maintained ledger; a restart replay and isolated
restore/write-fence check finish the run.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SOAK_SECONDS` | `3600` | 10 to 14,400 seconds of measured traffic |
| `SOAK_SEED_SALES` | `10000` | Historical receipts; maximum 100,000 |
| `SOAK_CADENCE_MS` | `10000` | Per-client interval, minimum 100 ms |
| `SOAK_REPORT` | unset | JSON progress/final report outside the temporary DB tree |

The server run uses a separate no-network container, the exact built application
image, one CPU and 768 MiB, with a private disk-backed scratch mount and report
mount. The driver and application share that budget; the real portal remains
running. No demo database/volume, external URL or exposed host port is accepted.
Stop the test container to abort; only its disposable fixtures are affected.
The report records the effective cgroup limits, revision and runtime.

One hour is evidence for this chosen workload, not the proposed four-hour
acceptance target, actual venue/Wi-Fi/tablet behavior or a guaranteed organizer
forecast. Refreshes occur after sales rather than reproducing an independent
12-second browser polling schedule. Recovery/browser fault injection is covered
by the separate suite. Keep these limits explicit in release decisions.


For an additional independent per-receipt/per-seller oracle, start the read-only
Python checker on the staging host **before** the soak finishes (the harness
removes its fixture database afterward):

```sh
sudo python3 scripts/check-soak-ledger.py /srv/basarkasse-validation/scratch /srv/basarkasse-validation/reports/independent-ledger.json --seed 10000 --wait-seconds 1200
```

This requires Python 3's standard library, not the application's money helpers.
It waits for event closure, opens one read-only snapshot and checks every fixture
receipt, the SHA-256 fingerprint of each new command against stored rows, each
seller's gross/commission/rounding/net, cash movement/void/payout intent counts and all six
counted/expected cash balances. It also deliberately changes two in-memory payout
amounts sharing a funding source by opposite cents: combined cash totals cancel, while
the per-seller check must reject them. It never edits the database. A private
synthetic fixture JSON is retained beside its summary for diagnosis; do not run
this fixture-specific checker on real event data or publish its raw snapshot.

## Event workflow regression evidence

`tests/event-workflow.test.mjs` exercises actual SQLite/service/HTTP code: scoped
full/compact reads, no cross-till turnover, fifty-cent validation, unique counted
contributions, underfunded/competing pool payouts, separate rounding, staff/PIN
revocation races, failed contribution rollback and historical migration. The
browser suite covers numeric price entry, assigned login links, team editing/PIN
privacy, counted settlement/float return and original-actor recovery from a wrong
scoped session. It also verifies obsolete unmarked pending commands are checked
without a sale POST. Original euro draft migration preserves cent-valued intent.

The HTTP/soak harnesses use synthetic runtime PIN keys, personal assigned accounts
and fifty-cent prices. The soak closes all tills before pooled payouts and
reauthenticates after restored sessions are invalidated. Do not supply real keys
or target event data to these disposable fixtures.
