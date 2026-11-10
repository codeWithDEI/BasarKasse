# Event teams, article input and counted settlement

This implements the requirements received on 10 November 2026. It does not remove
protected evaluation status or approve the 21 November event for real money.

## Configure the PIN display key

Login uses salted PBKDF2 hashes. Manager-only PIN display additionally requires
an encrypted copy, protected with AES-256-GCM and associated staff/event identity.
Set `BASAR_TEAM_PIN_KEY` to one stable random 32-byte key in hexadecimal. This is
a runtime secret, never a public/browser/build variable.

Generate it **once**, preserving any existing deployment `.env`:

```sh
umask 077
printf 'BASAR_TEAM_PIN_KEY=%s\n' "$(openssl rand -hex 32)" >> .env
chmod 600 .env
```

Do not append a second key on every start. Compose forwards the variable. For a
direct Node start, export the reviewed `.env` first (`set -a; . ./.env; set +a`).
Workers need an equivalent runtime secret and separate integration verification.
Normal login and financial work do not require PIN decryption, but creation/reset
of personal PINs fails closed without a valid key.

Back up the key separately to restricted off-host storage. SQLite copies include
ciphertext, not this key. Losing it leaves login hashes and financial records
intact, but PIN display becomes unavailable. Reset those PINs deliberately. Key
rotation needs re-encryption or managed resets and the old key for old backups.
Never put keys, PIN lists or decrypted responses in Git or browser recovery storage.

## Prepare event and tablets

1. Use the central setup manager to create an event. New events use pooled
   settlement and ten-cent payout rounding. Configure date, commission, seller
   range and till count before opening any till.
2. In **Verwaltung → Euer Kassenteam**, create personal accounts. Assign each
   cashier one till number. An event manager is bound to this event. A person
   working another event gets a separate event account.
3. Use **PINs anzeigen** privately. **Anmeldelink anzeigen** provides an event/person
   URL without a PIN. Open it on an idle tablet to preselect the name and event.
   Never clear site data to apply a link: an existing draft/pending command has
   priority and is not moved to the link's event.
4. Enter the personal PIN and open the assigned till with its float. Cashiers
   cannot change event/till. Their turnover, history, searches and full exports
   include only that till number.

The same editor changes name, role, assigned till, PIN or enabled state. Saving
revokes that person's sessions. Resolve active tablet work **before** changing
scope. Preserve IDs/history; do not recreate a person to recover an unknown sale.
Global setup accounts cannot be downgraded through the event team. The central
manager can explicitly assign unassigned legacy cashiers; they cannot log in
until assigned. The existing public demo cashier is fixed to the example event,
till 1. Public demo access still prevents production approval.

## Article input and recovery

Enter prices in tenths of euros: `5` = EUR 0.50, `25` = EUR 2.50, `65` = EUR 6.50.
Only fifty-cent steps are accepted. Cash received, checkout rounding, floats,
counts and cash movements still use ordinary euro input.

Old browser v2 drafts gain a `priceUnit` marker and atomic input conversion: old
`25` euros becomes new input `250`; cent-valued basket items, pending commands and
receipts remain unchanged. Invalid/non-fifty-cent drafts remain invalid until
corrected. A failed migration write blocks work. Known pre-upgrade pending commands
get separate provenance metadata while retaining their original financial payload.
Cached obsolete clients cannot submit new commands: the API requires the new entry
protocol, while still allowing lookup/exact replay of already recorded outcomes.
An unmarked pending command created after input migration is checked but not blindly
sent. Preserve it for technical price/outcome review. Close old tabs before upgrading.

Sleep/Wi-Fi recovery retains the original operation. If another scoped cashier is
signed in, **Ursprüngliche Anmeldung laden** signs that session out and loads the
original login without clearing the command. Reassignment may require a manager
to restore the original scope for review. No new ID bypasses an uncertain outcome.

## Count, pool and pay

1. Finish every purchase, then **Verkauf beenden**. New sales and till openings
   are blocked for a pooled event.
2. Under **Abrechnung → Kassen & Bargeld**, count **all** cash including floats.
   Close every opened till and explain differences. The count enters the pool
   once, atomically with closure. A replay adds no new cash.
3. All opened tills must close before payouts or pool movements. Return floats
   through **Einlage / Entnahme aus Topf**, recording actual amount and reason.
4. Review a seller statement. Commission rounds to cents; the remaining claim
   rounds **down** to ten cents. Example: EUR 6.50 gross, EUR 0.98 commission,
   EUR 0.02 rounding donation, **EUR 5.50 payout**. Checkout tips are separate.
5. Confirm only after handing over cash. One event/seller payout is permitted;
   pooled payouts/withdrawals cannot overdraw cash. Statement and CSV show the
   rounding donation separately. Close the event after all claims are paid.

Independent reconciliation includes goods, tips, commission, payout rounding,
returned floats and count differences. The pool uses counted cash, not invented
expected cash. It may retain association cash at event closure. Do not count
closed till contents and their pool contributions twice.

## Upgrade and compatibility

Stop tablet work and close old tabs. Retain off-host/database copies and the PIN
key, test `0004_event_workflow.sql` on a copy, then deploy one reviewed revision.
Existing payout values/IDs remain intact; existing events retain till/cent rules.
**Create a new event for the pooled workflow.** Never relabel a historical event.
Migration revokes old cashier sessions, binds only the known demo cashier to its
known event/till, and requires explicit assignment of other legacy cashiers.

Read the [restore runbook](monitoring-and-backups.md) before cutover. Restored
sessions stay invalid and old tablet epochs stay fenced after release. Backup
verification now checks/preserves the pool ledger too. Install the reviewed
Ubuntu utility toolkit and the Mac puller/verification helpers from this release
together; the previous installed Mac copy does not update itself when Git changes.

Venue WLAN and mixed Android/iOS tablets were reported by the organizer. Actual
Internet access, screen lock, storage, assigned links, counted settlement and
simultaneous traffic must still be rehearsed on those physical devices.
