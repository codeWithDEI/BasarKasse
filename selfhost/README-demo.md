# Protected evaluation deployment

This profile runs the training application at `/basarkasse` behind the existing
RötgesPortal Caddy proxy. It uses its own container and SQLite volume, publishes
no host port, and joins the existing internal `roetgesportal_backend` network.
It does not replace the portal web, analytics, certificates, or editorial data.

Set `BASAR_PUBLIC_ORIGIN=https://roetgesportal.de` in an ignored deployment `.env`
file. Use a reviewed exact Git commit, then run from the repository root:

```sh
docker compose --env-file .env -f selfhost/compose.demo.yaml config --quiet
docker compose --env-file .env -f selfhost/compose.demo.yaml up -d --build
docker compose --env-file .env -f selfhost/compose.demo.yaml ps
```

The build-time and runtime `NEXT_PUBLIC_BASE_PATH` must both be `/basarkasse`.
`BASAR_PUBLIC_ORIGIN` contains only the HTTPS origin, without that path.
The Docker dependency layer includes the pnpm workspace policy and lockfile.
Next.js 16.4.5 security packages have exact-version exceptions to the seven-day
release-age policy; the policy remains active for all other package versions.

Before adding public routing, wait for the container health check and verify
the page, static assets and API through the internal Docker network. Generate
a separate strong evaluation password; use `caddy hash-password` through stdin,
and put only its hash into a private server-local copy of
`Caddyfile.demo.example`. Never commit the real password or its hash.

The portal Caddyfile can import `/data/basarkasse-demo/*.caddy` inside its
canonical HTTPS site. An empty glob is valid, so fresh portal deployments do not
require the demo. Store the private route in that existing persistent Caddy
volume; back it up with the rest of the private deployment configuration.
Validate the complete Caddy configuration before reloading it. Demo requests
are excluded from the portal page-view counters. HTTP Basic Authentication and
HTTPS protect every demo page, asset and API request. The application session
cookie is also HTTPS-only and scoped to `/basarkasse`.

Verify externally that unauthenticated requests return 401, authorized users
can load assets, and login succeeds only with the configured public Origin.
Try a sale with rounding, verify change, view the sale, and check a seller's
settlement. Use synthetic data exclusively; this is an evaluation deployment.

To stop sharing, move the private `*.caddy` route out of the imported glob,
validate and reload Caddy, then stop the demo Compose service. Preserve the
`basarkasse-demo_demo-data` volume if the evaluation records should survive.
Never remove portal or certificate volumes. Updating the application rebuilds
only this Compose project from a new exact commit and preserves its SQLite data.

The original architecture review still documents further production work,
including separation of training and real data, account lifecycle management,
bounded read APIs, and the larger UI/service refactor. This demo deployment does
not claim approval for handling real money.
