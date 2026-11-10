# BasarKasse

A web cash register for community consignment bazaars. Cashiers enter seller
numbers and prices; managers reconcile tills and pay sellers after sales end.
The interface is German. Project documentation and contribution guidance are English.

**Status: protected evaluation / training only. Do not use this release to handle
real event money.** Six tills are a design goal, not an approved operating capacity.
See the [production readiness gates](docs/production-readiness.md) and
[measured test results](docs/testing/results-operations-2026-11-09.md) before planning a live event.

## What it does

- Multiple events, personal event/till-bound cashier logins and event-scoped teams.
- Twelve-hour sessions survive tablet sleep; remembered staff need only their PIN
  to log back in. Pending work always requires its original person.
- Manual baskets, cash received, change and optional donations through rounding up.
- Fifty-cent article prices without comma (`5` = EUR 0.50, `25` = EUR 2.50).
- Integer-cent accounting; separate commission, tips and ten-cent payout rounding.
- Full-sale voids, counted till closure into a cash pool, movements and seller payouts.
- Editable event teams, manager PIN display, personal login links and session revocation.
- Central persistence, operation IDs for replay protection, atomic booking batches.
- Indexed command reads, database-enforced receipt/open-till uniqueness and paged
  sale history with whole-event totals.
- Protected operational dashboard, verified scheduled backups and Mac off-host
  copies; restored databases fence old tablet commands until reconciliation.
- Seller statements, CSV, browser printing and event JSON exports.
- Atomic local drafts, pending commands and recovered receipts survive reloads;
  wake/reconnect reconciles the original operation. **This is not offline checkout.**

There is no physical article inventory, partial refund workflow, payment terminal,
TSE integration or fiscal export. Default training accounts and
training login remain enabled. Do not mistake a newly created event for a production mode.

## Quick start: local evaluation

Use **Node.js 24 LTS**, Corepack and the pinned **pnpm 11.25.0**. Node 22.23.2 was
also used for the recorded local tests; Node 24 is the Docker runtime.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm run build:selfhost
BASAR_PUBLIC_ORIGIN=http://127.0.0.1:3000 HOSTNAME=127.0.0.1 PORT=3000 BASAR_DATABASE=./data/basarkasse.sqlite pnpm run start:selfhost
```

For team creation/reset and encrypted PIN display, configure the stable runtime
`BASAR_TEAM_PIN_KEY` using the [team and settlement guide](docs/operations/event-teams-and-settlement.md).

Open [the local application](http://127.0.0.1:3000). Select **Anmelden & Kasse
öffnen**, expand **Übungsrollen anzeigen**, then choose **Übung als Kassenleitung**
or **Übung als Kassiererin**. Both demo
accounts use PIN `1234`. They are intentionally public training credentials.

A fresh database seeds an example event: 150 sellers, three tills and 15% commission.
Create a separate synthetic event with six tills **before opening its first till**
when evaluating the intended setup. Add personal accounts for that event and each
till. The public demo cashier is fixed to the example event, till 1. New events
use pool/ten-cent settlement; historical events retain till/cent policy. Settings
lock after the first till opens.

For a faster UI edit cycle against the same self-hosted SQLite adapter:

```sh
BASAR_DATABASE=./data/development.sqlite pnpm exec node --import ./selfhost/bootstrap.mjs ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
```

The separate `pnpm dev` / `pnpm build` workflow targets Vinext and hosted D1.
It is not a substitute for testing the self-hosted runtime.

## Verify a change

```sh
pnpm test
pnpm run typecheck
pnpm run build:selfhost
pnpm run build
```

For an isolated six-session HTTP test against a built Next.js server:

```sh
pnpm run build:selfhost
pnpm run test:load
```

The load script creates and deletes its own database and loopback server. It
never accepts an existing server URL. By default it seeds 5,000 sales, then sends
600 new sales through six sessions, including duplicate requests, refreshes and
restart checks. This is evidence for that workload, not live-event certification.
Browser interruption tests run with `pnpm exec playwright install chromium webkit`
and `pnpm run test:recovery` after the self-hosted build. They own a separate
temporary server/database and emulate Android/iPad layouts.

For a disposable longer test with six active clients and twelve as a final reserve
phase, run `pnpm run test:soak` (one hour, 10,000 historical sales by default).
Use the documented isolated container configuration; never target the demo DB.

See [test methodology](docs/testing/README.md) for parameters and limitations.

## Deploy an evaluation

```sh
BASAR_PUBLIC_ORIGIN=http://localhost:3000 docker compose up -d --build
```

For that command, open [http://localhost:3000](http://localhost:3000) so the
browser Origin matches the configuration. The default Compose profile exposes
only `127.0.0.1:3000` and persists SQLite in a named volume. Tablets need a configured HTTPS reverse proxy and an additional
access barrier while training logins exist. Configure the actual public origin
explicitly. Never expose this training application directly to the internet.

Follow [deployment and recovery](docs/operations/deployment.md). The existing
portal evaluation uses the separate [protected demo profile](selfhost/README-demo.md).
No ChatGPT account or WordPress installation is required for self-hosting.

## Documentation map

| Document | Purpose |
| --- | --- |
| [Contributing](CONTRIBUTING.md) | Setup, change workflow, review and validation |
| [Architecture overview](docs/architecture/overview.md) | Components, deployment choices and boundaries |
| [Teams and pooled settlement](docs/operations/event-teams-and-settlement.md) | PIN key, assigned login, counts and rounding |
| [Domain and data model](docs/architecture/domain-model.md) | Money, event lifecycle, roles and schema |
| [Queries and database invariants](docs/architecture/queries-and-invariants.md) | Indexed validation, bounded history and restore epochs |
| [Transactions and recovery](docs/architecture/transactions.md) | Atomicity, concurrency, idempotency and failure cases |
| [Architecture decisions](docs/architecture/decisions.md) | Existing decisions, trade-offs and proposed changes |
| [Testing](docs/testing/README.md) | Reproducible checks and acceptance scenarios |
| [Recorded results](docs/testing/results-operations-2026-11-09.md) | What was actually measured and what was not |
| [Deployment and recovery](docs/operations/deployment.md) | Configuration, migrations, backups and restore |
| [Monitoring and backups](docs/operations/monitoring-and-backups.md) | Health dashboard, Ubuntu/Mac schedules and restore fencing |
| [Register recovery](docs/operations/register-recovery.md) | Lock screen, Wi-Fi, same-person login and device rehearsal |
| [Event-day runbook](docs/operations/event-day.md) | Rehearsal, opening, incident response and reconciliation |
| [Production readiness](docs/production-readiness.md) | Prioritized work and release gates for real money |
| [Security](SECURITY.md) | Trust boundaries, reporting and known limitations |

## Repository orientation

`app/` contains the UI and HTTP route; `lib/basar/` contains financial rules and
booking logic; `db/schema.ts` and `drizzle/` define schema and migrations.
`selfhost/` supplies the SQLite adapter, server and backup utility; `worker/`
contains the hosted D1 entry point. `scripts/` also includes inherited hosting
and connector tooling. `examples/` is not the cash-register implementation.

## Project decisions still required

The project is licensed under **GPL-3.0-only**; see [LICENSE](LICENSE) and
[third-party attribution](NOTICE.md). Maintainers still need contribution ownership,
release maintainers and security response contacts. Agree the organizer's accounting,
data retention and applicable cash-register requirements before live approval.
