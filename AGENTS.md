# Repository guidance

Read `README.md`, `CONTRIBUTING.md` and the relevant architecture/operations docs
before changing behavior. This application is for protected evaluation until the
production gates are approved; do not remove that status as part of routine work.

Keep code/docs/commits in English and cashier-facing copy in German. Preserve
integer-cent accounting, atomic financial/audit/operation writes and operation
IDs during recovery. Never use a live event database for tests or commit secrets.
Add migrations rather than rewriting deployed SQL. Run the checks described in
`CONTRIBUTING.md`; state untested cases and known failures clearly.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
