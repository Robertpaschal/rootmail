# Deploy runbook

## Current production (September 27, 2026)

Production web traffic now uses the consolidated ARM host
`i-0b7b3474488dc906b` (`t4g.medium`). The existing web IP `32.195.196.221`
was reassociated to it; `api.rootmail.io` now points to that same address.
Mail DNS was not changed. PostgreSQL runs on `db.t3.micro`; the existing cache
endpoint now serves Valkey 7.2.6 with `noeviction`.

All six application services run on this host. Developers uses release
`4a0bd7ad3f393adf2fe3934671045130532cf8b7`; the other five use
`c0938b63fb58724dd64ae91a7dd8f5e2c98bc241`. These are intentional per-service
versions, not floating tags. Never recreate every service with one `TAG` merely
to update one service.

The three old hosts were stopped after cutover checks (including the API record's
300-second DNS TTL), backed up to completed encrypted EBS snapshots, then
terminated with owner approval. Their 90 GB of old root disks were deleted by
termination and their two unused IPs released. Only the new host's 20 GB disk and
one public IP remain. Snapshot completion/encryption was verified; a full restore
drill has not been performed. Backup identifiers are in the private account audit.

This is a single-host application stack, not high availability. Host failure
affects all apps, while the database and queue remain managed services. Basic
public/readiness checks passed, but no authenticated workflow or peak-load claim
is implied. Five infrastructure alarms and a monthly budget warning are now
configured. The health-alert email subscription is still pending confirmation;
do not mistake a configured alarm for a delivered operator notification.

The notification-only alarms cover EC2 status checks (2 of 3 one-minute samples),
CPU above 80 percent for 15 minutes, RDS free memory below 100 MiB for 15 minutes,
RDS free storage below 2 GiB for 15 minutes, and cache memory use above 80 percent
for 15 minutes. They do not restart/stop instances. This is infrastructure
monitoring, not an external application uptime check. Missing data remains
visible rather than being counted as a healthy datapoint.

## Verified release path

CI must pass on the exact current main revision before publishing. Native amd64
and ARM64 builds are assembled into a single immutable multi-platform image tag.
Hosts do not auto-update; neither the CI run nor image publishing is a deployment.
The ARM runtime acceptance job runs PostgreSQL 18 + Valkey 7.2 with mock mail only.

After syncing the release's compose file and deployment script to a host, use:

```bash
cd /home/ubuntu/rootmail
TAG=sha-<full40> ./deploy-host.sh <service>
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

On the consolidated host, the deployment script is copied to the release root
as `deploy-host.sh`; its repository source is `scripts/deploy-host.sh`.
Keep `.env.prod`, `.env.api.prod`, `.env.worker.prod` protected and separate.
Application ports are loopback-bound; Caddy is the public HTTPS entry point.
Its certificate data and configuration use persistent Docker volumes. Never
print interpolated compose settings or environment values into release logs.

After release, verify the exact running image, container health/restart count,
public HTTPS, API database/cache health, login redirects/noindex, documentation
canonicals/sitemap/static assets and worker queue counts. These checks do not
replace an authenticated end-user walkthrough or a peak-load test. Do not send
synthetic messages through the production mail provider.

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

So: check `df -h /` first when an SSM command dies for no reason. The old host had
a prune cron; the new ARM host does not. Logs are bounded to three 10 MB files per
container and the new host had 14 GiB free after cutover. If image cleanup is
needed, run it only after deployments finish: pruning between pull and container
replacement can remove the incoming image. Preserve rollback-holder containers;
never use a volume/system prune as routine release cleanup.

## Hosts

| host | instance | runs |
|---|---|---|
| production ARM | `i-0b7b3474488dc906b` | all six apps and Caddy |
| old api (retired) | `i-00fc3899bf560fefb` | terminated after encrypted snapshot |
| old worker (retired) | `i-07f1f375578886933` | terminated after encrypted snapshot |
| old web (retired) | `i-05b681a056fa42fc3` | terminated after encrypted snapshot |

### Recovery after retirement

Application-image rollback remains available through the guarded deploy script
and pinned predecessor images. Recovery from a lost host requires provisioning
and restoring retained artifacts/backups; the terminated hosts cannot simply be
restarted, and their released IPs must not be reused in DNS. Preserve the current
production EIP and verify restored health before reassociation. A disk snapshot
is not an instantly available server. Never start a recovered old worker while
the production worker is still running. Keep the old compose alongside an old
worker image, because pre-heartbeat images cannot satisfy the new healthcheck.

The admin console is at **internal.rootmail.io** — there is no
`admin.rootmail.io` record.

## Principals

Anything the *running app* does needs the **`rootmail-app` EC2 role**. Anything
run from the CLI needs the **`claude-depoy` user**. Both S3 (`GetObject` for
inbound mail) and SES (`GetEmailIdentity`) were granted to the wrong one first,
and both failed in ways that looked like working code.
