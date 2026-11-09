# Architecture decision register

This records existing choices, not retroactive approval for production.
Proposals remain proposals until implemented and verified in a reviewed change.

| ID | Status | Decision and consequence |
| --- | --- | --- |
| ADR-001 | Implemented | Integer cents and basis-point commission, rounded per seller. Avoid float arithmetic in every report and API. |
| ADR-002 | Implemented | Central online database; browser drafts are local assistance. No offline financial writes or multi-device merge algorithm. |
| ADR-003 | Implemented | One event revision serializes financial decisions through atomic batches. Simple invariants, but shared contention and five-attempt exhaustion. |
| ADR-004 | Implemented; physical-device acceptance open | Operation IDs and persisted results protect replay. Financial commands now have uniform scope/fingerprint checks, durable outcomes and atomic browser recovery state. See the recovery runbook. |
| ADR-005 | Implemented | Same service on D1 or a SQLite adapter. Deployment-specific integration/durability tests remain necessary. |
| ADR-006 | Evaluation topology | One self-hosted process, local volume, HTTPS proxy and separate protected demo. No high-availability claim. |
| ADR-007 | Proposed | Typed command contracts and injected persistence interface; split UI/auth/query/booking modules with behavior preserved. |
| ADR-008 | Proposed | Bounded/paginated reads and SQL financial aggregates, supported by constraints and indexes. Benchmark before/after. |
| ADR-009 | Open | Choose the primary supported live runtime and operational owner. SQLite may suffice for six tills, but current evidence is incomplete. |
| ADR-010 | Open | Decide license, external contribution policy, release maintainers and supported security contact. |

## When to revisit the database choice

Measure latency, contention and restore behavior on the intended server with
end-of-day data and device traffic. First remove avoidable full-state work and
fix recovery semantics. Consider a server database or redesigned serialization
only if measured targets, operational availability or maintainability justify it.
A database migration alone does not fix lost browser state or an uncertain sale.

Future ADRs should state context, considered options, decision, consequences,
validation and the migration/rollback plan. Keep old decisions and mark supersession.
