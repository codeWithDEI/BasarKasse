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

The six-register characterization test intentionally verifies that today's
five-attempt limit can return 409 and that explicit retry preserves exactly one
sale. **A passing characterization test does not mean the contention gate passes.**
A second test sends competing seller payouts and checks the till is debited once.
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
database is accepted. All six sessions currently share the demo cashier account.

A failure exits nonzero. Timing is diagnostic; there is no calibrated CI timing
threshold. Seed rows bypass the API and do not contain complete historical audit
or operation records. New measured sales use the real HTTP route and service.
The replay check ignores an already received response; it does not inject a
network drop during commit. SIGTERM restart is not a power-cut test. Scheduled
12-second polling, real browser rendering, unique staff identities and proxy
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
entry and waking while an earlier reply remains suspended. Chromium uses an
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
