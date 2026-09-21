# Deploy runbook

## Verified release path (prepared September 2026)

CI must pass on the exact current main revision before publishing. Native amd64
and ARM64 builds are assembled into a single immutable multi-platform image tag.
Hosts do not auto-update; neither the CI run nor image publishing is a deployment.
The ARM runtime acceptance job runs PostgreSQL 18 + Valkey 7.2 with mock mail only.

After syncing the release's compose file and deployment script to a host, use:

```bash
cd /home/ubuntu/rootmail
TAG=sha-<full40> ./scripts/deploy-host.sh <service>
```

The script pulls before replacement, pins the previous image with a never-started
container, verifies dependency/readiness health and the exact image, and restores
the old image if validation fails. A failed release remains a failure even after
successful rollback. Do not prune containers carrying `rootmail.rollback.service`
labels: they protect the rollback image. No database migrations run by default;
review backward compatibility before opting into a migration.

If `docker-compose.host.yml` exists beside the base compose file, the script uses
it for validation, release, health checks and rollback. Preserve this host-local
overlay when copying a release. Consolidated hosts use it to retain separate API
and worker environment files, bind application ports to loopback, and connect web
server-side requests to the API through the private Docker network. Never render
interpolated compose output into logs: it contains secrets. Validate with
`docker compose --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.host.yml config --quiet`.

The worker heartbeat is new. An older worker image cannot satisfy the new worker
healthcheck; retain the old compose file with its image during the first transition
and perform that first rollback with both artifacts, not only the new script.

The consolidated ARM host and managed-service resizes are **not deployed yet**.
The existing hosts below remain authoritative until cutover is verified.

## Historical manual procedure (not the new guarded release path)

```bash
cd /home/ubuntu/rootmail
docker pull -q pachal/rootmail-<svc>:sha-<full40>
docker tag pachal/rootmail-<svc>:sha-<full40> pachal/rootmail-<svc>:latest
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --force-recreate <svc>
docker image prune -f          # see below
```

## Two things that will bite you

**`--env-file .env.prod` is not optional.** The prod compose passes frontend
config by interpolation (`ROOTMAIL_API_URL: ${PUBLIC_API_URL}`), and compose
interpolates from a file literally named `.env`, which the hosts do not have.
A plain `docker compose up -d` recreates the web containers with every such var
set to the EMPTY STRING — no crash, no failed healthcheck, just "Cannot reach
the rootmail API at ." on every page. The backend uses `env_file:` instead, so
the API keeps working and it reads as a frontend bug.

**Prune, or the disk fills.** Every deploy leaves the previous `sha-*` image
behind. The web host reached 98% (670 MB free) after one day of deploys, at
which point `docker pull` fails *and takes the SSM agent down with it* — the
command dies with `ipc messaging received timeout signal`, which looks like a
network fault and is actually a full disk. `docker image prune -a -f` reclaimed
21 GB; running containers are never touched, and every removed image is
re-pullable.

So: check `df -h /` first when an SSM command dies for no reason, and prune as
part of the deploy rather than after the outage.

## Hosts

| host | instance | runs |
|---|---|---|
| api | `i-00fc3899bf560fefb` | api, caddy |
| worker | `i-07f1f375578886933` | worker (registry SHA image; verified September 2026) |
| web | `i-05b681a056fa42fc3` | marketing, dashboard, admin, developers |

The admin console is at **internal.rootmail.io** — there is no
`admin.rootmail.io` record.

## Principals

Anything the *running app* does needs the **`rootmail-app` EC2 role**. Anything
run from the CLI needs the **`claude-depoy` user**. Both S3 (`GetObject` for
inbound mail) and SES (`GetEmailIdentity`) were granted to the wrong one first,
and both failed in ways that looked like working code.
