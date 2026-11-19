# Security and installation boundaries

The default deployment remains protected evaluation, with public demo credentials
behind proxy access control. The explicit production profile provisions a separate
empty database and fails closed if `BASAR_MODE` and the installation marker differ.
Production never seeds demo accounts and denies the demo-login endpoint.
Implementation/preparation does not approve real-money event operation.

See [production access](docs/architecture/production-access.md) for device scope,
versioned password hashing, twelve-hour sessions, one-use enrollment, revocation
and offline manager recovery, and [launch gates](docs/production-readiness.md).

## Current controls

- Production requires a trusted device plus personal authentication. An unpaired
  browser obtains only installation/device metadata. Register devices can log in
  only cashiers assigned to their event/till. Evaluation login names/metadata
  remain visible behind the evaluation proxy boundary.
- Production credentials use salted PBKDF2-SHA256 with 600,000 iterations:
  six-to-eight-digit cashier PINs and 15–128-character manager passwords.
  Evaluation retains legacy verifiers. Account attempt limits are enforced.
- Secure (on HTTPS), HttpOnly, SameSite=Strict, path-scoped session/device cookies.
  Sessions expire after twelve hours without an extra idle timeout. Tablet lock
  and WLAN loss do not revoke valid sessions. PINs/passwords are never stored in
  browser draft records. Temporary enrollment secrets are removed after confirmation.
- POST requires JSON and the expected Origin. Set `BASAR_PUBLIC_ORIGIN`; arbitrary
  forwarded headers are not trusted. Financial requests have bounded item/body sizes.
- Cashier queries, exports and commands are event/till scoped. Team changes revoke
  sessions and authorization versions. Device/account guards also run at commit.
- Cashier PIN display is an explicit authorized manager response. AES-256-GCM
  ciphertext is bound to staff/event IDs with a separate stable key. Manager
  passwords are never recoverable/displayed. Back up the key separately and never
  export a decrypted PIN list.
- Atomic financial/audit/outcome writes and immutable command IDs support replay
  recovery. They do not protect against a server administrator editing SQLite.
  Restores revoke devices/sessions, change epoch and pause writes for reconciliation.

## Dependencies and remaining boundaries

The 19 November 2026 `pnpm audit --prod --json` still reports 11 advisories:
0 critical, 4 high, 4 moderate and 3 low. No dependency versions were changed in
this production-preparation change. The [dated review](docs/testing/dependency-review-2026-11-19.md)
records affected paths and reachability limits; these findings are not reported
as fixed. The image still includes development dependencies. Dependency cleanup
and a smaller image remain priority maintenance work requiring their own builds
and regression checks.

Keep HTTPS, private tablet/host access, restricted backups and separately preserved
keys. File permissions/SSH transfer are implemented; at-rest encryption, retention
ownership, recovery loss-window acceptance and supported security disclosure
contact remain operator responsibilities. A valid device cookie is a bearer
credential, not hardware attestation. Same-origin malicious code, stolen cookies,
host/disk/power loss and venue Internet failures remain outside these guarantees.
Never log authorization headers, cookies, PINs or complete request bodies.

Report suspected vulnerabilities privately to the repository owner; do not put
credentials or personal records in public issues. The maintainers still need to
establish a supported disclosure contact and response process.
