# Event-day runbook

Use only after [production readiness](../production-readiness.md) is signed off.
This checklist is also the agenda for a complete synthetic rehearsal.

## Before the event

Name a technical lead and deputy, an event/cash manager and a separate person
checking final accounts. Record contact numbers, escalation and the decision
maker who can pause sales. Freeze the reviewed release; rehearse restoring the
backup on a spare instance. Agree paper fallback and subsequent reconciliation.

Configure the real event before opening any till: date, seller range, commission
and **six** tills. Keep training data and access separate. Create individual staff
accounts using the future production provisioning flow. Test venue Wi-Fi, power,
HTTPS, all six devices, charger access and any shared portal/server load. Have
printed seller/till procedures, numbered paper receipts and a manual cash log.
Do not promise offline checkout: the current application requires a connection.

## Opening

Check the signed release record, backup health/free disk and server monitoring.
On each device select the correct event/till and person. Check for unresolved
pending work before changing users/events. Two people count and record each
opening float. Open each till once; verify six distinct open till sessions and
the correct balances centrally. Record opening counts outside the application.

## During sales

Confirm the sale and change on screen before handing over the completed purchase.
For a spinning request, timeout or uncertain result, pause that register and
recover the **same operation**. Do not enter the basket again with a new ID or
clear local browser storage to dismiss the problem. Involve the cash manager if
the physical cash and confirmed sale are uncertain.

Keep deposits/withdrawals with reasons and a corresponding physical handover
record. The system does not track ownership of money moved to an external safe.
Managers document voids and ensure refunds come from the original open till.
Do not make unrecorded cash corrections to force a displayed balance.

## Incident response

| Situation | Immediate action |
| --- | --- |
| One device loses connection | Pause it, retain draft/pending state, check network and operation outcome; do not promise an offline sale |
| Multiple tills cannot book | Pause affected sales, alert technical lead, check service/disk/network; preserve evidence and uncertain IDs |
| Restart required | Stop new work, record pending operations, restart approved service, verify persisted results before resuming |
| Host/database restore required | Block all devices; follow the restore/cutover runbook and independently reconcile the lost window before access resumes |
| Extended outage | Event manager activates numbered paper receipts and manual cash logs; record the switchover time and reconcile before any later import/re-entry |

There is no automatic paper-receipt import or offline synchronization. Decide a
controlled manual reconciliation procedure in advance. Never silently mix paper
and software totals or replay unknown operations after restoring an old backup.

## Settlement and closing

The manager ends sales once all pending checkouts are resolved. Check seller
statements and donations separately. Pay each seller once from the recorded open
till and retain the agreed handover acknowledgment. Use recorded cash movements
when balancing funds between tills. Count tills independently, record differences
and explanations, then close them. Close the event only once seller claims are
paid and every till is closed.

Export statements, receipts, movements and reconciliation data; take and verify
a consistent final database backup off-host. Reconcile physical cash, opening
floats, active sales/donations, movements and payouts independently. Record who
approved any discrepancy and retain data under the organizer's agreed policy.
