# BasarKasse

A web cash register for community consignment bazaars. Cashiers enter seller
numbers and prices; managers reconcile tills and pay sellers after sales end.
The interface is German. Project documentation and contribution guidance are English.

**Status: protected evaluation / training only. Do not use this release to handle
real event money.** Six tills are a design goal, not an approved operating capacity.
See the [production readiness gates](docs/production-readiness.md) and
[measured test results](docs/testing/results-2026-11-08.md) before planning a live event.

## What it does

- Multiple events, numbered tills, personal PIN sessions and cashier/manager roles.
- Manual baskets, cash received, change and optional donations through rounding up.
- Integer-cent accounting; commission rounded once per seller, excluding donations.
- Full-sale voids, deposits, withdrawals, seller payouts and counted till closure.
- Central persistence, operation IDs for replay protection, atomic booking batches.
- Seller statements, CSV, browser printing and event JSON exports.
- Local drafts and pending commands survive reloads. **This is not offline checkout.**

There is no physical article inventory, partial refund workflow, payment terminal,
TSE integration or fiscal export. Account disablement, PIN changes and session
revocation are not exposed through the interface. Default training accounts and
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

Open [the local application](http://127.0.0.1:3000). Select **Anmelden & Kasse
öffnen**, then **Übung als Kassenleitung** or **Übung als Kassiererin**. Both demo
accounts use PIN `1234`. They are intentionally public training credentials.

A fresh database seeds an example event: 150 sellers, three tills and 15% commission.
Create a separate synthetic event with six tills **before opening its first till**
when evaluating the intended setup. Settings lock once a till has been opened.

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
| [Domain and data model](docs/architecture/domain-model.md) | Money, event lifecycle, roles and schema |
| [Transactions and recovery](docs/architecture/transactions.md) | Atomicity, concurrency, idempotency and failure cases |
| [Architecture decisions](docs/architecture/decisions.md) | Existing decisions, trade-offs and proposed changes |
| [Testing](docs/testing/README.md) | Reproducible checks and acceptance scenarios |
| [Recorded results](docs/testing/results-2026-11-08.md) | What was actually measured and what was not |
| [Deployment and recovery](docs/operations/deployment.md) | Configuration, migrations, backups and restore |
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

Maintainers must select a license, contribution ownership policy and release
maintainers before opening the project for general external collaboration.
No project-wide license has been selected in this repository; bundled third-party
license notices do not settle that decision. Agree the organizer's accounting,
data retention and applicable cash-register requirements before approving live use.
