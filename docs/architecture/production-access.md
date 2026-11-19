# Production installation and trusted devices

Production is an explicit self-hosted profile. It does not change the default
protected evaluation deployment, and its implementation does not approve an event.
The [launch runbook](../operations/production-launch.md) defines the remaining gates.

## Installation lifecycle

Migration `0005_production_access.sql` labels existing databases `evaluation`.
`BASAR_MODE` defaults to `evaluation`; an environment/database mismatch fails
closed with `MODE_MISMATCH`. The production provisioner creates a separate new
database with a random installation ID, random restore epoch and `prepared` phase.
It never copies demo accounts, events, receipts or recovery commands.

Prepared installations allow event/team configuration but reject till opening,
financial commands and event closure. Offline activation requires explicit,
recent approval for that installation. It checks integrity, foreign keys, empty
financial history, production credential verifiers and current devices/accounts
for every till. It atomically changes the phase to `live` and releases writes.
A restored live installation remains live with writes paused and cannot use this
fresh-activation path to bypass restore reconciliation.

The browser storage key includes the production installation ID. Evaluation
baskets and legacy records are retained under their existing keys and never
adopted into a fresh production event. Database restores preserve the installation
ID but change the epoch, so old pending commands remain available for reconciliation
and are fenced from automatic submission.

## Device and person are separate checks

An unpaired browser can read installation mode/phase and its own device status;
it cannot obtain event/team data or use the demo endpoint. An offline operator
issues a random 256-bit invitation scoped to management or one event/till. The
invitation expires after 72 hours; the device grant expires eight days after issue.
Register devices can authenticate only cashiers assigned to that event/till.
Management devices can authenticate managers and cashiers within their scope.
A device grant alone cannot book a sale or reveal cashier PINs.

A setup URL carries the secret in its fragment, keeping it out of HTTP request
URLs. A non-secret `setup` ID forces document navigation when scanning into an
old tab. The browser temporarily keeps the code and a random claim nonce in
sessionStorage, removes the fragment, then claims a Secure/HttpOnly/SameSite=Strict
cookie. A conditional SQL update admits the first nonce; an exact nonce retry
recovers a lost reply. A second browser with a different nonce cannot reuse the
consumed invitation. Temporary pairing data is removed after successful confirmation.
Treat invitation links, QR cards and browser/session storage as private access data.

Sessions last twelve hours from login without an additional idle timeout. Locking
the screen or losing WLAN leaves the server session intact. If it expires, an
already paired cashier tablet needs the remembered person and personal PIN;
there is no proxy username/password prompt. Clearing cookies or using another
browser requires a new device invitation. Native tablet lock/storage behavior
still requires physical acceptance.

Sessions are bound to their device. Revocation invalidates sessions; account
changes also increment authorization version. Financial event-claim SQL and
session insertion recheck active devices/accounts inside their transactions,
closing revocation races. Pending commands still require the original actor and
retain their original operation ID and payload after a replacement-device login.

## Credentials and recovery

Production uses versioned salted PBKDF2-SHA256 verifiers with 600,000 iterations.
Cashier PINs contain six to eight digits. Manager passwords contain 15–128
characters; initial provisioning generates a random 24-character password.
Legacy/demo verifiers are refused in production. Account attempt limits remain
ten attempts per ten minutes. A register scoped to another person is rejected
before it can consume that person's attempt allowance.

Cashier PINs additionally have AES-256-GCM ciphertext bound to staff/event IDs,
using the separately backed-up installation key. Authorized managers can reveal
cashier PINs; manager passwords have no recoverable ciphertext or display endpoint.
The private initial handover contains the manager password and one-use device
links, not a decrypted cashier PIN list. Offline recovery replaces a manager
password, revokes their sessions and clears the account lockout while retaining
the original actor ID and financial history.

These choices follow the OWASP [password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
and [session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
They do not provide hardware-bound device attestation or protect against malicious
same-origin code, stolen browser cookies or a server administrator. Keep tablet
access, HTTPS, host administration and private backup storage controlled.

## Supported boundary

This production profile is for one self-hosted Next.js process and one local
SQLite volume. The hosted D1 profile builds, but production device provisioning,
load and restore acceptance have not been established for D1. There is no offline
checkout, replicated failover database or guarantee of zero loss after host failure.
