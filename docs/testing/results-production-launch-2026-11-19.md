# Production launch — 19 November 2026

The owner explicitly authorized publication after merging PR #10 and reported
successful Internet and lock/WLAN-recovery checks on both cashier tablets.
The public service is now the **two-till Spielzeugbasar, 21 November 2026**.
Future six-till Babybasar acceptance remains separate.

## Release identity and state

- Application runtime: `33bab6a663482d217d97e43f6e4958d8344e545b`.
- Reviewed merged source: `383c3278ddff68a11d0bcfe9c73c1c3cafa757ca` (PR #10).
  Runtime paths match; the provisioning example/documentation differ.
- Image: `sha256:4ff20ab50082c05bd48824179c901ca0e35c6447a510bb0b63ca1a79e4db6ea0`.
- Publication: 22:22 UTC / 23:22 Europe/Berlin; phase `live`, writes enabled.
- One CPU, 768 MiB, read-only root, persistent separate SQLite volume, no host port.
- Two active cashier accounts; separate event-lead and technical-support manager
  accounts. Cash opening balances/team assignments remain event-day tasks.
- No sale, till session, payout, movement or pool entry was created during launch.
  Seven durable setup operations are nonfinancial configuration/team changes.

The previously recorded [software/load/restore results](results-production-preparation-2026-11-19.md)
apply to the unchanged application image. The owner accepted the disclosed
backup/loss-window and dependency-review limits for this release. Eleven
production dependency advisories, including four high, remain unresolved; no
clean-security or zero-loss recovery guarantee is claimed.

## Protected abort and correction

The first activation changed the installation phase, but the final public probe
ran inside the deliberately internal Docker backend network and failed DNS with
`EAI_AGAIN`. The guard paused writes and restored the evaluation route. Financial
tables were verified empty, and the database was retained without restore.

The probe was corrected to run through host Python/urllib with normal TLS
verification and bounded timeouts ([PR #11](https://github.com/codeWithDEI/BasarKasse/pull/11)).
Six Python cutover tests pass, including failure/data preservation and an explicit
host-probe/network-isolation regression. The app network remains internal.

Recovery retained the original approval/snapshot and matched the original epoch,
installation/image/key, empty financial tables, previous route/container state
and fresh backups before releasing the original paused installation and publishing
it. No phase reset, stale database restore or synthetic financial command occurred.
The private launch record retains both attempts and the exact recovery/probe code.

## Public verification and handover

Public HTTPS metadata, anonymous-event denial and disabled demo login passed from
the host; the live production identity was independently retrieved from the Mac.
Actual technical-support login over public HTTPS passed using a temporary device
grant, which was then revoked. Secure/HttpOnly/SameSite=Strict cookies, manager
scope, two-till event and authenticated health access passed. All dashboard checks
(database, disk, server backup, Mac backup and API) were `ok`.

The named event-lead account was verified on an isolated snapshot with two
concurrent device sessions. A second login/logout does not invalidate the first
session. There is no fixed per-account device/session limit; each browser needs
its own valid management-device invitation. Register-scoped devices cannot be
used as management devices merely by entering the manager password.

Two private one-use lead invitations and a separate password handover were prepared
on the troubleshooting Mac. They were not consumed by deployment checks; credentials
and invitation URLs are not committed. Login sessions last twelve hours; device
grants expire eight days after issue, and unused invitations expire after 72 hours.
The owner forwards the private device package and password separately.
