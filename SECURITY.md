# Security and evaluation boundaries

This release is for protected evaluation with synthetic data. Default manager
and cashier accounts and the demo-login API remain enabled. Changing a displayed
PIN or hiding demo buttons would not remove those server-side capabilities.
There is no supported production provisioning mode yet. Event PIN editing does
not make the public demo manager private.

## Current controls

- Server-side manager checks for privileged commands; PIN hashes use salted
  PBKDF2-SHA256, and sessions expire 12 hours after login, with no shorter idle
  timeout. Tablet locking and Wi-Fi loss do not log out a valid session. The
  browser remembers a staff ID for PIN re-entry; this is not an authentication
  credential. Pending commands require their original actor.
- HttpOnly, SameSite=Strict session cookie; Secure when the configured public
  origin is HTTPS. Cookie path follows the build-time application base path.
- POST requires JSON and the expected Origin. Set `BASAR_PUBLIC_ORIGIN` behind
  a reverse proxy; forwarded headers are not blindly trusted.
- Login attempts are limited by account, not by a client-supplied IP header.
- Financial mutations use atomic batches and operation records. These provide
  consistency controls, not protection from an administrator editing SQLite.

## Outstanding controls before live use

Production bootstrap, removal of demo access and locked-out central manager
recovery remain open. Event team editing, PIN reset/disable and session revocation
are implemented. Cashier SQL reads/exports and commands are bound to their event/till;
they do not receive other tills' sales/turnover or manager payout/pool/audit data.
Unauthenticated protected snapshots expose selected event metadata and login names.

PIN display is an explicit manager team response. Recoverable PINs use AES-256-GCM
with `BASAR_TEAM_PIN_KEY` outside SQLite; login retains salted PBKDF2 verifiers.
PINs are excluded from normal snapshots, pending storage, fingerprints and logs.
Protect and separately back up the key; do not export decrypted PIN lists. Team
changes revoke sessions and increment authorization version. Financial commit and
session-issuance guards close reassignment/PIN-reset races. See
[team operations](docs/operations/event-teams-and-settlement.md).
Legacy unresolved staff commands require private technical review during upgrade.
Financial commands now retain their ID through unknown outcomes and session expiry;
actual device/storage and venue acceptance remain required. See
[transactions](docs/architecture/transactions.md).

Review dependencies for each release. The 2026-11-08 review after the demo fixes
found 11 production audit advisories (0 critical, 4 high, 4 moderate, 3 low).
This is a historical snapshot, not a statement that all reachable vulnerabilities
are resolved. Re-run `pnpm audit --prod --json` and assess the reachable paths.
The image currently includes development dependencies and should be reduced
before establishing a supported production release process.

Keep HTTPS, proxy access control, private backups, least-privilege runtime users
and restricted server access. Never log authentication headers, session cookies,
PINs or complete request bodies. Agree retention/access rules with the organizer.

Report a suspected vulnerability privately to the repository owner. Do not put
credentials or personal event data in a public issue. The maintainers still need
to establish a supported disclosure contact and response process.
