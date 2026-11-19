# Prepare and launch a new production bazaar

Preparation is authorized; public activation requires the owner's later explicit
Go and closure/acceptance of the [release gates](../production-readiness.md).
A merged PR does not authorize the initial launch by itself. Keep the evaluation
route, database, key and backup channel intact throughout preparation.

## Layout and configuration

The intended Ubuntu layout is:

| Item | Production location |
| --- | --- |
| Source | `/srv/basarkasse-production/source` |
| Private runtime environment | `/etc/basarkasse-production/app.env` |
| Private launch plan | `/etc/basarkasse-production/launch.json` |
| Data volume | `basarkasse-production_production-data` |
| Application | `basarkasse-production-basarkasse-production-1` |
| Backups/state/release evidence | `/srv/basarkasse-production-ops` |
| Private initial handover | `/srv/basarkasse-production/secrets/initial-access.json` |
| Mac copies/key/device cards | `~/Library/Application Support/BasarKasse/production/` |

Use `selfhost/compose.production.yaml`: one CPU, 768 MiB, read-only root, no added
capabilities, persistent local volume, no host port and the existing portal backend
network. Build with `/basarkasse`; the eventual public URL remains
`https://roetgesportal.de/basarkasse`. Until Go, Caddy still points at evaluation.
A private candidate route must remain outside the active `*.caddy` import glob.

`BASAR_MODE=production` is required. Generate a new stable 64-hex
`BASAR_TEAM_PIN_KEY`; never reuse or rotate the evaluation key. Keep runtime and
key files mode 0600 in private directories and back up the production key separately
on the Mac. Confirm existing volumes/paths before any Docker operation.

Proposed event defaults are 21 November 2026, six tills, 15% commission and seller
numbers 1–150. These are preparation values, not organizer acceptance. Accounts
initially have the distinct names `Kasse 1` through `Kasse 6`; assign real people
and confirm cash responsibilities before opening. Do not use the actual prepared
production database for rehearsal sales.

## Fresh provisioning

Use a **new** database path and handover file. The tool refuses existing files.
Configuration follows `selfhost/production.example.json`; inputs must be private.
Run inside the matching image with the private runtime environment:

```sh
node --experimental-strip-types selfhost/production.mjs prepare \
  --database /data/basarkasse.sqlite --config /private/event.json \
  --handover /private/initial-access.json
node --experimental-strip-types selfhost/production.mjs inspect \
  --database /data/basarkasse.sqlite
```

Expected: phase `prepared`, writes paused, one event, six cashiers, seven device
invitations, zero demo users and zero sales/tills/payouts/movements/pool entries.
There is one nonfinancial setup audit entry. Do not seed a float or open tills.
Generate private printable QR cards using the same release:

```sh
node selfhost/device-cards.mjs PRIVATE-HANDOVER NEW-PRIVATE-CARD-DIRECTORY
```

Each card is a one-use secret for one intended tablet/browser. Do not publish
cards, take real credential screenshots or put them in the repository. Read the
manager password privately from the handover. Cashier PINs are visible only in
authorized team management; never export a decrypted list. Unclaimed invitations
expire after 72 hours; if launch moves, issue new ones and revoke obsolete grants.

## Backups and preparation verification

Install separate production backup wrappers selecting
`BASAR_OPS_ENV=/etc/basarkasse-production/ops.env`; use the production service and
timer templates. Pin backup code and image to the candidate revision. Configure
the Mac puller's `service=basarkasse-production-backup.service` and
`ackCommand=/usr/local/bin/basarkasse-production-backup-ack`, production-only
remote root and destination. Keep the evaluation scheduler/configuration unchanged.
The production Mac agent is `de.basarkasse.production-backup`, every five minutes.
Keep the Mac powered, awake, unlocked as needed and network-connected; the dashboard
marks stale or failed copies. Use the existing [backup/restore runbook](monitoring-and-backups.md).

Before Go, require a verified server snapshot, matching Mac copy, separately
preserved key and isolated restore drill. The snapshot contains credential hashes
and encrypted cashier PINs but remains sensitive. File permissions and SSH transport
are provided; disk/backup encryption and the possible five-minute loss window need
owner acceptance. Copying an old snapshot cannot recover missing acknowledged sales.

`selfhost/production-cutover.py check` validates the private launch plan, current
image/key/volume, unchanged portal configuration/containers, empty prepared DB,
fresh server/Mac backup, at least 5 GiB free storage and a separate candidate Caddy
configuration. It never activates the database or reloads the proxy:

```sh
sudo python3 /srv/basarkasse-production/source/selfhost/production-cutover.py check
```

Run automated writes/load/restore against disposable databases with no production
volume mounted. Production mode is supported by the soak harness:

```sh
SOAK_MODE=production SOAK_SECONDS=3600 SOAK_SEED_SALES=10000 \
  SOAK_REPORT=/tmp/production-soak.json pnpm run test:soak
```

Use the exact image and intended one-CPU/768-MiB limits. This measures synthetic
HTTP traffic, not real tablets, Wi-Fi, HTTPS rendering or power loss.

## Explicit Go

1. Review and merge the production PR. Fetch `main`, verify the built candidate is
   a merged ancestor (or compare all runtime paths after a squash merge), and
   verify the image's recorded commit. If runtime files differ, rebuild/retest;
   documentation-only evidence updates do not require an image rebuild.
2. Confirm event values, real tablets and venue Internet, interrupted checkout
   recovery, named technical/cash leads, fallback process, capacity envelope,
   dependency risk review and the backup/loss-window policy. Record evidence;
   do not turn unknown acceptance into `true` just to pass the script.
3. After the owner's explicit Go, write a mode-0600 approval JSON with
   `approved:true`, `approvedBy`, current ISO `approvedAt`, matching
   `installationId`, `reviewedRuntimeRevision`, `mergedRevision` and acceptance
   booleans named `configurationAccepted`, `venueInternetChecked`,
   `tabletsAndRecoveryChecked`, `cashProcedureAndOwnersAssigned`,
   `backupLossWindowAccepted`, `capacityAccepted`, `dependencyReviewAccepted`.
   The prepared template keeps all approval fields false/unset.
4. Pull a fresh verified Mac backup, run `check`, then run:

   ```sh
   sudo python3 /srv/basarkasse-production/source/selfhost/production-cutover.py activate \
     --approval /etc/basarkasse-production/approval.json
   ```

The script rechecks the plan, preserves the previous private route and snapshot,
activates only that prepared installation, atomically replaces only the imported
BasarKasse route and reloads Caddy. Public checks require the exact live production
installation and denial of anonymous event access/demo login. It does not consume
operator invitation codes or create financial test rows. Keep evaluation data and
container retained privately, with no competing public route.

Verify manager login, paired devices, health/backup ages and event values after
cutover; open tills only after counting the real opening cash. Train cashiers on
ordinary euro input, uncertain results and their personal PIN. The initial QR
freischaltung replaces the evaluation proxy username/password hurdle, not the
personal PIN. The manager retains a strong password.

## Failure and recovery

If public verification fails after activation, the script pauses production writes,
retains its database and restores the previous evaluation route. It never restores
a stale database over potentially committed sales. Inspect the preserved launch
record and reconcile all affected tablets before any retry. A failed launch is not
reset to fresh preparation. Existing ledger data must remain intact.

Offline operator actions run in the matching image against the intended volume:
`recover-manager` reads a private password file; `invite-device` writes a new
private invitation file; `revoke-device` invalidates the grant and sessions. Use
`--database`, `--manager`/`--device` IDs and `--credentials`/`--config`/`--output`
file arguments; never put passwords, PINs or invitation codes in command arguments.
A full restore revokes every old device/session, changes the epoch and pauses
writes. Issue a new management invitation offline, reconcile missing receipts
and pending tablets, then use the dedicated restore-release process. Fresh
activation is intentionally unavailable for a restored live database.
