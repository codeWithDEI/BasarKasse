# Contributing to BasarKasse

Start with the [README](README.md), [architecture](docs/architecture/overview.md)
and [production readiness list](docs/production-readiness.md). This repository
currently delivers a training application. Keep that status visible in changes.

## Development setup

1. Clone the repository and create a branch for one coherent change.
2. Install Node.js 24 and activate the exact pnpm version in `package.json`.
3. Run `pnpm install --frozen-lockfile`. Commit lockfile and dependency policy
   changes together. Avoid mixing npm, Yarn and pnpm lockfiles.
4. Use the self-hosted development command in the README for SQLite work.
   Use a disposable database and synthetic seller numbers and names.
5. Run the relevant checks below and open a pull request with evidence.

`pnpm-workspace.yaml` enforces dependency age/build policies. Do not disable
these policies to resolve installation errors. Exact-version security exceptions
must be explained and reviewed. `scripts/install-pnpm.sh` is for the managed
Linux hosting environment; ordinary macOS/Linux contributors can use pnpm directly.

## Change boundaries

- Use English for code, documentation, commit messages and PR descriptions;
  preserve German cashier-facing copy unless a language change is intentional.
- Keep money in integer cents. A rate of `1500` means 15% in basis points.
- Preserve original sales and their void metadata; do not delete financial rows
  to make totals match. Keep booking, operation result and audit entry atomic.
- Keep permission and validation checks on the server. Hiding a UI button is
  not authorization. See the [role matrix](docs/architecture/domain-model.md).
- Add new numbered migrations; never edit a migration already deployed.
  Update both Drizzle schema and migrations. Test an upgrade of an existing database.
- Never commit a real SQLite database, exports, `.env`, passwords, PINs, session
  tokens, private keys or deployed access hashes. Only the documented demo PIN
  is a public fixture. Do not use real event records in tests or screenshots.
- Treat hosting scripts and connector scaffolding as a separate concern. Remove
  unused scaffolding only with builds for both runtimes and a clear scope.

## Validation

For changes affecting bookings, roles, migrations, shared configuration or dependencies:

```sh
pnpm test
pnpm run typecheck
pnpm run build:selfhost
pnpm run build
```

For booking/concurrency/read performance changes, also run `pnpm run test:load`
after the self-hosted build and attach the workload, runtime and results.
For UI recovery changes, exercise real browsers and interruption scenarios from
[the testing guide](docs/testing/README.md). API tests alone are insufficient.
Documentation-only changes need link/command review; re-running expensive builds
is unnecessary if no executable files or configuration changed.

`pnpm run typecheck` regenerates Next.js route declarations before TypeScript
checking. This avoids stale/conflicting generated declarations after switching
between Vinext and Next.js builds; do not edit `.next/` by hand.

`pnpm lint` exists, but the inherited UI/service contain broad `any` usage and
have not established a clean lint baseline. Do not describe lint as passing
without running it. CI currently checks tests, TypeScript and both builds.

## Pull requests and releases

Describe the concrete before/after behavior, financial invariants affected,
validation performed and remaining limits. Update architecture/operations docs
when their contracts change. Keep a known failed acceptance gate visible even
when a characterization test passes. A passing test which explicitly expects a
conflict is not a successful capacity acceptance test.

A maintainer reviews and merges changes. Deploy a reviewed exact revision, back
up before migrations and record image/revision, schema state and recovery plan.
Do not deploy or load-test against an event containing real money as part of a PR.
See [release gates](docs/production-readiness.md). The project license and external
contributor policy still require an owner decision before general contributions.
