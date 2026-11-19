# Ordinary euro article input — 19 November 2026

Implementation: [PR #8](https://github.com/codeWithDEI/BasarKasse/pull/8),
requirement BK-REQ-014 (supersedes BK-REQ-002). Merge/deployment pending.

Scope: replace tenths-of-euro shortcuts with one ordinary euro input format for
all tills. No format setting, schema migration or repricing of historical data.
Protected evaluation status and production acceptance gates remain unchanged.

## Behavior and upgrade contract

- `2,50` / `2.50` means EUR 2.50; `5` means EUR 5.00; `25` means EUR 25.00.
- Decimal keyboard, interpreted-amount preview, help and item editing use euros.
- Positive fifty-cent steps and EUR 10,000 maximum remain server-enforced.
- An old `priceUnit: tenths` input `25` becomes `2,50` atomically once. Original
  unmarked euro input stays unchanged. Non-digit old text is retained for review
  and requires fresh entry. Numeric invalid increments remain invalid.
- Basket/receipt cents, cash inputs and immutable pending commands/IDs stay
  unchanged. A failed storage write preserves the old record and blocks adoption.
- Only an original migrated tenths command (or already validated older command)
  may be resubmitted by the current client. Unknown obsolete-client commands are
  blocked; matching committed and rejected outcomes remain recoverable.
- Close old tabs for rollout. Browser storage is upgraded as well as the client
  protocol; application rollback must account for the upgraded draft format.

## Validation

Local runtime: macOS, Node 22.23.2 (x64/Rosetta), SQLite 3.53.4, pinned pnpm
11.25.0. These are local development measurements, not Ubuntu capacity approval.

| Check | Result |
| --- | --- |
| `pnpm test` | 71 tests passed, zero failures |
| `pnpm run typecheck` | Passed |
| `NEXT_PUBLIC_BASE_PATH=/basarkasse pnpm run build:selfhost` | Passed |
| `pnpm run test:load` | 600/600 new sales through six assigned sessions; 61 exact replays; 5,600 persisted receipts; restart replay, independent ledger and SQLite/FK checks passed |
| `pnpm run test:recovery` | 66 Chromium/WebKit cases passed with zero retries |
| `pnpm run build` | Passed (Vinext/Cloudflare) |

Both tablet layouts were visually inspected from the ordinary-euro browser case.
New browser coverage includes comma/point/whole euros, exact item editing,
once-only draft conversion, invalid old-text re-entry and original pending-sale
recovery before server arrival and after a lost committed reply. HTTP tests also
reject new obsolete-client commands and changed-payload replay while preserving
matching committed and rejected outcomes.

The [raw HTTP result](results-euro-entry-load-2026-11-19.json) records 6.699 seconds
for the measured 600-sale phase, POST p95 50.5 ms / maximum 88.1 ms. No production
quota, real tablets, reverse proxy or venue network was involved.

The six-session HTTP harness also now retains the register index with each
receipt. Parallel completion order is arbitrary: restart replay must use that
receipt's original session, rather than assuming the first reply belongs to
register zero. The previous fixture could correctly receive OPERATION_MISMATCH
from the application. No authorization check was weakened to fix this fixture.

All HTTP/browser checks own disposable synthetic databases and local loopback
servers; they do not target the Ubuntu evaluation database. Browser layouts
emulate Android tablets and iPads. They do not prove the actual decimal-keyboard,
camera, screen-lock or venue-network behavior of the physical tablets. No
four-hour field rehearsal or production approval is claimed.
