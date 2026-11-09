# Register recovery and tablet rehearsal

Target event: **21 November 2026**. Complete this rehearsal on every intended
physical device/browser before deciding on live use. Automated Chromium/WebKit
tests are available, but do not certify physical screen locking or venue Wi-Fi.

## Operating rules

Use the same normal browser profile and exact HTTPS URL throughout the event.
Use one BasarKasse tab per profile. Do not use private browsing, clear site data,
change origin/path or switch browsers to resolve a pending sale. A second tab
waits for the first instead of opening an independent copy of the basket.
Current browsers must support Web Locks and `AbortSignal.timeout`; unsupported
or unwritable storage blocks financial work. Test managed-device cleanup policies.

Drafts and entered cash/rounding survive reloads. A sale is submitted only after
**Verkauf abschließen**. Once submitted, its immutable operation ID is retained
until a committed receipt or durable rejection is known. Returning to the app or
reconnecting checks the original outcome automatically.

## Low-friction shift login

Sign in once at the start of a shift. Sessions have a fixed **twelve-hour** lifetime
from login, with no shorter inactivity logout. Tablet lock, tab reload and Wi-Fi
loss do not themselves end a valid session. A resumed page still verifies the
session on the server. Expired, logged-out or disabled accounts cannot book.

The register remembers only the last authenticated **staff ID** in its existing
atomic browser record. Existing v2 records default this new field to empty;
financial drafts, receipts and operation IDs remain intact. PINs and session tokens
are never stored in this record. Authentication remains an HttpOnly cookie plus
server-side session; knowing a remembered name does not grant access.

When login is needed, tap **Erneut anmelden**, enter the PIN in the large numeric
field and choose **Weiterarbeiten** (or press the keyboard's submit key). Incorrect
PINs clear only the PIN field, show an error and keep focus ready to try again.
Four to eight digits remain supported; choose individual four-digit cashier PINs
for the rehearsal if that is the organizer's policy. Do not share a manager PIN.
The existing account-based attempt limit remains enforced.

Use **Andere Person** to change a remembered selection before login, or the profile
button to change staff deliberately. An unsubmitted basket is preserved during a
person change; the eventual sale is attributed to the person who submits it.
Once a command has been sent, only its original person can reconcile it. If that
person is unavailable, pause the till and involve the technical/cash lead.
At the end of a shift use the profile button and **Abmelden**, and keep the tablet
physically controlled. A locked tablet is not an application logout.

The evaluation's outer HTTP Basic Auth is separate from this personal PIN flow.
Provision its credentials once on each rehearsal tablet; test browser prompts
with the actual proxy. Training shortcuts remain available under **Übungsrollen
anzeigen** on an initial login, so this change does not close production-access
gates or remove the protected evaluation requirement.

## If the tablet locks or Wi-Fi fails

1. Keep the cash and purchase together until the outcome is known. Do not re-enter
   the basket, start another customer, pay money back or collect payment again
   while the first outcome is uncertain.
2. Unlock the tablet and return to the same tab/browser. Reconnect to the network.
   The app checks the pending operation. If necessary use **Status prüfen**.
3. If prompted, choose **Erneut anmelden**. The original person is already shown;
   enter their personal PIN and confirm. The result is checked automatically.
   There is no person selector or demo shortcut while a command is pending.
   Another account cannot take over that operation.
4. A recovered **VERKAUF #… GESPEICHERT** receipt is the original sale, not a new
   payment. Give the displayed change once and select **Nächster Einkauf** only
   when the handover is complete.
5. **Nicht gebucht: …** means a durable business rejection. The unbooked basket is
   retained; resolve the cause with the cash manager before a new submission.
6. If the outcome stays unclear, storage is blocked/corrupt, or the original person
   is unavailable, pause this register and involve the cash/technical lead.
   Preserve the browser data. Do not bypass the block by making another sale.

A lost connection does not enable new offline bookings. If the browser discards
the entire page, the application must load from the server when the network is
available again; its stored draft/pending command is then restored.

## Required physical-device rehearsal

Use only a synthetic event, individual test accounts and a written expected ledger.
For every device record model, OS, browser version, URL and result:

- Enter seller 42 / EUR 6.50, round to EUR 7.00, receive EUR 10.00. Lock/unlock
  before submission; restore the draft and verify partial entry fields.
- Submit, immediately lock, unlock after 30 seconds; confirm one stored sale and
  EUR 3.00 change. Repeat with at least a five-minute lock.
- Disable Wi-Fi before submission (new booking must be blocked), then restore it.
- Disable Wi-Fi immediately after submission. Restore it, verify one receipt and
  exactly one sale centrally. Repeat several times; network timing is variable.
- Close/reopen the tab with an uncertain operation and with a confirmed receipt.
- Lock/unlock and reload with a valid session: no PIN prompt should appear.
- Let a test session expire/revoke it technically; verify the original name is
  already selected, enter a wrong PIN then the correct PIN, and recover one sale.
  Check that another account cannot take over. Also rehearse deliberate staff
  changes with an unsubmitted basket and four-/eight-digit PINs.
- Open a second tab: it must wait. Close the first; the second must recover the
  current receipt/draft instead of a stale basket.
- Repeat with all six physical registers and realistic end-of-day data, including
  simultaneous submissions and shared server load.

The technical team can run deterministic response-drop/storage-failure scenarios
with `pnpm run test:recovery`; physical Wi-Fi switching alone cannot guarantee
which side of commit was interrupted. Independently count sales, operation IDs,
amounts, donations, change, audit effects and till balances after each scenario.
A successful rehearsal closes only its measured gates, not all production risks.

## Upgrade and restore precautions

Before installing this recovery version, stop register activity and close **all**
old BasarKasse tabs. Back up the database, deploy migration `0002`, then reopen the
approved URL. Existing operation results and pending financial commands are kept;
legacy storage migrates once to a namespaced v2 record. Old v1 keys remain as
evidence and must not be used by an old client after upgrade.

An old unresolved `addStaff` command requires technical review before migration;
its legacy pending key can contain a PIN. Verify that non-financial operation
privately, then remove only the confirmed obsolete secret-bearing key. Do not
apply that cleanup to an uncertain financial command.

Do not downgrade the client during active sales: the old client cannot read v2
state. A database restore can lose already acknowledged operations and needs the
separate [blocked-device cutover procedure](deployment.md#restore-drill-and-incident-restore).
The new [restore epoch and write pause](monitoring-and-backups.md) block old
commands after a restore; operators must still reconcile the missing interval.
Browser recovery alone cannot reconstruct absent acknowledged receipts.
