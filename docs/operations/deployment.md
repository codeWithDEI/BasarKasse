# Self-hosted deployment, backup and recovery

This runbook currently supports protected evaluation. Resolve the
[production gates](../production-readiness.md) before real cash use.
Use a reviewed exact revision and separate data/access for each environment.

## Configuration

| Variable | Purpose |
| --- | --- |
| `BASAR_DATABASE` | Writable local SQLite file; default `data/basarkasse.sqlite` |
| `BASAR_PUBLIC_ORIGIN` | Public HTTP(S) origin only, e.g. `https://cash.example.org`; no path |
| `HOSTNAME`, `PORT` | Self-hosted listening address/port; use loopback behind a host proxy |
| `NEXT_PUBLIC_BASE_PATH` | Optional path prefix such as `/basarkasse`; same value at build and runtime |

The path prefix is baked into browser assets. Rebuild to change it. Configure
HTTPS/access control at the reverse proxy and preserve the public Host. Do not
trust arbitrary forwarded headers to determine the accepted Origin.
Self-hosting uses Node's built-in SQLite; there is no separate database daemon.
Keep the file on a persistent local filesystem, not a shared/network-mounted volume.

## Installation

Use the README Node.js 24/pnpm commands or `docker compose up -d --build`.
Default Compose binds loopback port 3000 and persists `/data` in a named volume.
The Dockerfile runs as the `node` user. Verify directory ownership before startup.
Docker and a real Ubuntu build were exercised for the protected demo; new
revisions still need their own release validation.

For an existing portal use [the dedicated profile](../../selfhost/README-demo.md)
with its separate volume, network, access control and health check. Do not expose
a new public port or replace the portal application when updating the demo.
For a generic proxy, `selfhost/nginx.example.conf` only supplies proxy headers;
it does not configure TLS or evaluation access control by itself.

Startup applies unapplied `drizzle/*.sql` files in filename order, each in a
transaction, and records them in `__basar_migrations`. The hosted D1 platform
applies migrations separately; self-host migration tracking is not a D1 migration
ledger. Back up before an upgrade; test the migration on a restored copy first.
No general down-migration mechanism is supplied.

## Deployment verification

Verify HTTPS, authentication on pages/assets/API, login with expected Origin,
foreign-Origin rejection, correct Secure/HttpOnly/path cookie and a synthetic
sale/replay/change/void/payout/closure cycle. Confirm the effective Node/SQLite
versions, journal and synchronous settings, writable storage and available disk.
A GET health response does not prove a write will succeed. Keep synthetic write
probes isolated from a real event. Record revision/image and migration list.

For a systemd installation, use a dedicated unprivileged account, explicit
working directory/environment, persistent database directory and restart policy.
A complete systemd unit is not supplied. Never run ad-hoc production servers in
an SSH shell or start multiple processes against the live file as a scaling fix.

## Consistent backup

The helper uses SQLite's online backup API. Give each backup a new target path:

```sh
BASAR_DATABASE=/var/lib/basarkasse/basarkasse.sqlite node selfhost/backup.mjs /secure-backups/basarkasse-before-upgrade.sqlite
```

For the default Compose service, with a writable backup subdirectory in its
existing data volume:

```sh
docker compose exec -T basarkasse node selfhost/backup.mjs /data/backups/before-upgrade.sqlite
docker compose cp basarkasse:/data/backups/before-upgrade.sqlite ./before-upgrade.sqlite
```

Move the copied backup to restricted off-host storage and verify it. A backup
remaining inside `/data` is lost with the same disk/host. The default Compose
project and the protected demo have different service/volume names; use the
matching Compose file and service. Do not mount or modify unrelated portal volumes.

Schedule backups and monitor age/failure/disk consumption. Define retention,
access, encryption and the acceptable loss window with the event owner. No
scheduler, remote transfer or monitoring was included in the initial import.
The current Ubuntu/Mac installation supplies these via the
[monitoring and backup workflow](monitoring-and-backups.md). Event JSON/CSV
exports aid reconciliation but are not a supported database restore/import path.

## Restore drill and incident restore

1. Block register access and preserve the old database, logs and pending-device
   evidence. Stop the application before replacing files.
2. Restore first to a **separate instance** to verify the selected backup. Check
   `PRAGMA integrity_check`, foreign keys, migrations, event/sale counts, operation
   records, seller totals and till balances against independent records.
3. For cutover, move the stopped database **and any `-wal` / `-shm` files** aside
   together. Install the verified **restored copy produced by the restore helper**,
   with its new epoch and paused writes; never install the raw unfenced snapshot.
   Set correct ownership/permissions and start only the selected application revision.
4. Keep devices blocked until the event manager reconciles acknowledged receipts
   newer than the backup and all uncertain/pending operations. Stale devices must
   not automatically replay against a restored database missing those records.
5. Record recovered revision, backup timestamp, missing window, reconciled cash
   and authorization to resume. Keep the previous files until sign-off.

The helper's reopen test alone does not constitute a full restore drill. The
current restore helper adds a new instance epoch and pauses writes; old
clients remain fenced after explicit reconciliation/release. Follow the
[restore procedure](monitoring-and-backups.md#actual-restore-and-tablet-cutover).
This control does not recover receipts absent from the selected backup.

## Updates, rollback and monitoring

Freeze the approved revision before the event. Test upgrades on a backup clone,
then back up, deploy and verify before reopening. An older image may not understand
a newer schema; roll back using a compatible image/database pair with an explicit
reconciliation plan. Never blindly restore an old backup after sales have resumed.

Monitor booking latency, errors/conflicts, unresolved operations, backup age,
restarts, disk, memory and network. The protected dashboard and backup age/failure
checks are implemented; the
[monitoring guide](monitoring-and-backups.md) defines their scope. Durable financial
metrics, external alerts and broader runtime fault coverage remain separate work.
Do not log PINs, cookies or whole command bodies.
