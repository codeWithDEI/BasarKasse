# Monitoring, off-host backups and restore fencing

This describes the protected Ubuntu evaluation installation, not live-event
approval. Keep production access, physical-device/venue checks and organizer
sign-off separate. No email or external messaging service is configured; the
organizer chose a continuously visible health dashboard.

## Health dashboard

Open `/basarkasse/health` on the protected evaluation domain. Sign in as a manager
in the same browser first, then return to the dashboard. Its API rejects anonymous
and cashier sessions. The outer HTTPS/Basic Auth barrier still protects all pages,
assets and API requests. No credentials, financial rows or staff lists appear in
health responses. A dashboard tab does not acquire the register's basket lock.

The page refreshes every 15 seconds and displays database/write availability,
free disk, last verified server backup, last confirmed Mac copy and recent API
latency/errors. A missing or failed backup is critical. Backup age exceeds the
warning threshold after six minutes and becomes critical after ten minutes.
Disk warns below 5 GiB or 10% free; critical below 1 GiB or 5%. API figures cover
up to 512 recent POST responses, with a five-minute display window; they include
login/status requests and reset when the process restarts. They are not a complete
financial monitoring or audit system.

If fetches fail or the browser has no server contact for 45 seconds, the overall
status turns red and individual old green cards become **Nicht aktuell**. A stale
screen must not imply safety. A completely suspended browser/monitor cannot
update until it resumes; power and kiosk/lock settings belong in the rehearsal.

## Installed schedules and private data locations

The Ubuntu service `basarkasse-backup.service` and timer `basarkasse-backup.timer`
make a consistent SQLite online backup every five minutes. The source application
volume is mounted read-only in a separate no-network utility container limited
to 0.25 CPU / 256 MiB. Backups are never made by copying a live `.sqlite` file
without its WAL. The helper verifies receipt item totals, SQLite integrity and
foreign keys, then publishes a private standalone database and SHA-256 manifest
atomically. Backup copies use DELETE journaling; the live database remains WAL
with `synchronous=FULL`.

Host configuration: `/etc/basarkasse/ops.env` (root, mode 0600):

```sh
BASAR_BACKUP_VOLUME=basarkasse-demo_demo-data
BASAR_BACKUP_IMAGE=basarkasse-validated:<exact-application-revision>
BASAR_OPS_ROOT=/srv/basarkasse-ops
BASAR_OPS_CODE=/srv/basarkasse-ops/releases/<exact-tools-revision>/selfhost
```

The immutable tool directory is mounted read-only at `/operations`. Its utility
code revision can advance independently of the application image; record both.
Install the two shell helpers into `/usr/local/bin/basarkasse-backup` and
`/usr/local/bin/basarkasse-backup-ack`, and install the supplied service/timer in
`/etc/systemd/system`. Create private `backups/` and `state/` directories owned by
container UID/GID 1000. Do not grant the application write access to monitoring
files or mount unrelated portal volumes.

```sh
sudo systemctl daemon-reload
sudo systemctl start basarkasse-backup.service
sudo systemctl enable --now basarkasse-backup.timer
sudo systemctl list-timers basarkasse-backup.timer
sudo journalctl -u basarkasse-backup.service --since today
```

The demo mounts only `state/` read-only at `/ops-state` and sets
`BASAR_OPS_STATE=/ops-state`. `BASAR_REVISION` identifies the deployed application.
Backups and status files are private (directories 0700, files 0600), outside the
web root. Verification does not log PINs, cookies or whole financial commands.

The Mac LaunchAgent `de.basarkasse.backup` runs at login and every five minutes
while the Mac is awake. Installed files are under:

- `/Users/daniel/Library/Application Support/BasarKasse/`
- `backups/` beneath that directory contains the actual off-host copies.
- `/Users/daniel/Library/LaunchAgents/de.basarkasse.backup.plist`

`config.json` selects the existing SSH identity/host and a private local folder;
it contains no private key material or password. The SSH key must remain available
and its trusted host key must already be enrolled. Each pull first requests a
fresh server snapshot, downloads to a new staging file, checks its SHA-256,
SQLite integrity, foreign keys and receipt arithmetic, and then acknowledges the
same digest back to the server. The dashboard uses the original server backup
time, not a new timestamp that could make an old file appear fresh.

```sh
launchctl print gui/$(id -u)/de.basarkasse.backup
launchctl kickstart gui/$(id -u)/de.basarkasse.backup
```

A stopped/asleep/disconnected Mac is **not** an off-host backup service. The Mac
card ages to amber/red; this is intended. Keep the Mac awake, connected and powered
throughout the event. Filesystem permissions and SSH encryption are configured;
at-rest disk encryption/FileVault and a spare-Mac recovery path still require an
organizer decision/check. No email/push alert is implied by this dashboard.

Retention keeps the latest 12 snapshots, one per 24 hourly buckets and seven daily
buckets on the server; the Mac retains 12 recent, 48 hourly and 30 daily buckets.
Sparse histories can retain older bucket representatives. Pruning runs only after
a verified new snapshot/copy. Keep independent pre-upgrade and final-event copies
outside these automatic sets when accounting policy requires longer retention.

## Actual restore and tablet cutover

The restore helper refuses to overwrite an existing destination. Always use a
new, isolated database and the exact intended application/migration revision:

```sh
node selfhost/restore.mjs /private/backups/selected.sqlite /private/drill/restored.sqlite
```

It checks the backup, migrates only the copy and assigns a new instance epoch with
writes paused. Old sessions and login throttles are cleared only on the copy,
so restoring a backup cannot reactivate a previously logged-out session. Staff
must sign in again; reconcile account/PIN changes made after the backup as well.
It compares financial row counts and receipt totals before/after.
The original backup stays unchanged. Start an isolated instance to test it, and
independently reconcile all acknowledged receipts newer than the backup and every
pending tablet command. A copy can be internally consistent yet still lack sales
acknowledged after its timestamp. Five-minute snapshots do not guarantee zero loss.

After that reconciliation, the technical/cash lead explicitly releases this copy:

```sh
node selfhost/restore.mjs release /private/drill/restored.sqlite --after-reconciliation <restored-epoch>
```

While paused, financial commands/status lookup fail with `WRITE_PAUSED` without
recording a financial outcome. After release, pending commands carrying the old
epoch, and legacy commands without an epoch, fail with
`RESTORE_REVIEW_REQUIRED`. The browser retains the original pending command.
A fresh client must load the new epoch before any new work. Do not clear an old
pending basket or create a new ID to bypass the fence. A manager/technical review
must decide what cash was actually collected and what must be recovered.

For a real incident, block device access and stop the application before replacing
files; move the old database/WAL/SHM aside together. Install the **fenced restored
copy**, never the raw original snapshot, at the active database path. Reopen access only after the
cash lead has reconciled the missing interval and authorized cutover. Never run a
restore against the active path or automatically replay devices into an old backup.


The versioned operations directory also contains `restore.mjs`, `migrations.mjs`
and `sqlite.mjs`. For server-side recovery, use this exact toolkit with the matching
application image/migrations. Create the restored copy in a separate private
staging mount with backups mounted read-only; do not mount the live database for
that first step. After installing the verified paused copy and completing the
cash reconciliation, the explicit release can run against the selected volume:

```sh
# Run only after the cash lead has authorized reconciliation/cutover.
# Load the reviewed root-owned ops.env; never substitute an unrelated volume.
sudo sh -c '. /etc/basarkasse/ops.env; docker run --rm --network none --read-only --cap-drop ALL --user 1000:1000 --mount "type=volume,source=$BASAR_BACKUP_VOLUME,target=/data" --mount "type=bind,source=$BASAR_OPS_CODE,target=/operations,readonly" "$BASAR_BACKUP_IMAGE" node /operations/restore.mjs release /data/basarkasse.sqlite --after-reconciliation RESTORED_EPOCH'
```

Replace `RESTORED_EPOCH` with the ID from that specific restore, keep device access
blocked until release/verification, and then sign staff in again. This command
updates only the pause flag for that epoch; it cannot make old pending commands
valid. It is not a substitute for the financial reconciliation.
