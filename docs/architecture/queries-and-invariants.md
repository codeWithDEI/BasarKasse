# Indexed commands, bounded history and database invariants

The financial commit protocol remains event-revision compare-and-swap plus one
atomic batch containing financial changes, audit and the operation outcome. This
change reduces the data needed to validate that batch; it does not replace the
idempotency protocol with browser-side totals.

## Enforced database invariants

Migration `0003_event_operations.sql` adds:

- Unique `(event_id, number)` on sales, including voided receipts.
- Unique `(event_id, number)` on till sessions **where `closed_at IS NULL`**.
  A closed till number can be reopened as a new session; two open copies cannot.
- Event/till indexes for active sale sums, movements and seller payouts; an
  event/time audit index; an event till lookup index.
- A singleton instance epoch/write-pause row used by restore cutover.

The existing unique event/seller payout index remains. Migration refuses existing
conflicting financial rows atomically; it never renumbers/deletes them. Investigate
and reconcile such data before retrying an upgrade. Drizzle schema, SQL, snapshot
and journal are committed together. Self-hosting explicitly uses WAL and
`synchronous=FULL` on every connection.

Migration `0004_event_workflow.sql` adds one counted pool contribution per till,
payout accounting/funding checks, event/till staff scope and authorization version.
Historical payout values are copied unchanged; invalid accounting aborts migration
instead of inventing repaired cash. See [domain rules](domain-model.md).

## Command reads

`lib/basar/queries.ts` loads the requested event and the relevant tills, payouts
and aggregates for a command. A new sale does **not** load prior sale rows or item
JSON: it checks at most 300 basket seller IDs against payouts, validates its till
and obtains the next receipt number from the indexed maximum. A void loads its
original sale. Cash changes use indexed till sums; a seller payout aggregates
that seller's active items. Closing an event aggregates the seller claims it
needs to verify. Settings changes use an existence check rather than a sales list.

The event revision is claimed after validation. If another command changed it,
the candidate financial/audit/operation writes are guarded no-ops and the service
reads again. Up to twelve attempts have small bounded randomized delays after a
lost revision; exhausted contention is an unrecorded `CONCURRENT_WRITE`, retaining
the original command ID for the existing client recovery path. Unknown storage
failures remain uncertain 503 outcomes, never inferred business rejections.

## Browser snapshots and receipt history

The current UI uses `GET /api/basar?view=register&event=...`. It returns:

- At most 50 receipts, with `salesPage.nextBefore` for keyset pagination by the
  unique receipt number. New inserts do not shift old pages like numeric offsets.
- Whole-event goods/donation/count/item/void totals for managers (assigned-till totals for cashiers), seller summaries and till
  balances calculated on the server in the same batch as that receipt page and
  event revision. They do not describe only the visible fifty receipts.
- The latest 200 audit rows, staff/event selectors and required till/payout data.
- The instance epoch and whether writes are paused.

`before` must be a positive safe integer; search text is limited to 80 characters
and bound as query parameters. Receipt/person/till/seller search applies to the
whole event before the page limit, including receipts outside the initial page.
Cashier SQL filters constrain tills, receipts, totals and full exports to their
assigned number. Seller/payout/audit/pool data is manager-only; PIN responses are
separate. Managers are event-bound unless using the central setup account.

The UI explicitly navigates older/newer pages and discards stale refreshes.
Search/page state is separate from the durable basket/pending-command record.

The domain helpers accept the compact totals so existing UI totals, seller
commission, payout dialogs and till closure do not accidentally sum a partial
history. Tests compare multi-page counts and independent expected cent values.

Full `GET /api/basar?event=...` remains for legacy clients and **explicit** complete
CSV/JSON export. New automatic polling and mutation validation do not use it.
Exports fetch the full event deliberately so they cannot silently contain only
the current page. These exports can still be expensive; JSON is not a supported
SQLite restore path. Seller/till aggregate work still grows with event history,
and selectors/payout lists are not unbounded-scale interfaces. Measure against
an agreed event forecast before making capacity claims.

## Restore epochs

Normal migration initializes epoch `initial` and accepts legacy commands that
lack an epoch. New commands carry the epoch loaded with their event state.
A restored copy receives a random new epoch and starts write-paused. The HTTP
operation lookup and service mutation entry points enforce the pause/epoch before
an old command can be resubmitted. Explicit release does not make old commands
valid again. See [monitoring and backups](../operations/monitoring-and-backups.md)
for the reconciliation and cutover procedure.
