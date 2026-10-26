# Deploy runbook

## Current production (October 26, 2026)

API and worker: `effd2bdbe3fe5f52b2f960c3a6075817c7e2cc4a` (PR #59).
Dashboard: `328f5ade6bcb9f916cba758360e07e9b7961420b`; admin:
`cd3d3ff90454d045167d0a750a70fbdc25942e6c`; public marketing/developers:
`182928943604ddb3eb4ba79ec48fc0ae3a6fb7a1`. All are healthy. Exact-main CI and
image publishing passed. Migrations 0083/0084 applied before guarded API canary;
both labelled owner-inbox API/worker canaries delivered. Previous API/worker
`328f5ad` images remain held for rollback.

The host-local overlay now includes opt-in `auth-pilot` services and the internal
`auth-content` network on API/worker. Preserve it and the separate environment
files. The dedicated hook uses `.env.sprout-hook.prod`, not the broad API env.
Caddy runs on the host network: its exact hook route proxies to loopback 4011,
with no access logging or proxy retries. Other API routes still use port 4000.
No new paid instance/database/cache was provisioned.

The pilot is not complete: Supabase hook activation and native session remain
pending. Only the isolated QA scope is admitted. Before rolling back to older
code, disable the hook/admission and drain or expire auth jobs; preserve replay
metadata. Host config/environment backups are in `.pilot-backup-20261026`
(root-only). Never print those files. Detailed controls and current evidence:
[Sprout validation report](sprout-pilot-validation-2026-10-25.md).

## Previous production (October 16, 2026)

Production web traffic now uses the consolidated ARM host
`i-0b7b3474488dc906b` (`t4g.medium`). The existing web IP `32.195.196.221`
was reassociated to it; `api.rootmail.io` now points to that same address.
Mail DNS was not changed. PostgreSQL runs on `db.t3.micro`; the existing cache
endpoint now serves Valkey 7.2.6 with `noeviction`.

All six application services run release
`182928943604ddb3eb4ba79ec48fc0ae3a6fb7a1` (PR #43). The owner-requested beta
release completed at 22:59:30 WAT on 15 October, after isolated API canary and
post-swap worker delivery checks. All six were intentionally released together;
future single-service changes should still be deployed only to affected services.
Each predecessor image is pinned by its rollback holder. Rollback uses
`TAG=sha-b2d448bd61deb8297f5e6880745adf2e164fbf9e ./deploy-host.sh <service>`.
No migrations or production configuration changes accompanied this release.
See `docs/beta-readiness-2026-10-15.md` for CI, delivery and captured-reply evidence.

The three old hosts were stopped after cutover checks (including the API record's
300-second DNS TTL), backed up to completed encrypted EBS snapshots, then
terminated with owner approval. Their 90 GB of old root disks were deleted by
termination and their two unused IPs released. Only the new host's 20 GB disk and
one public IP remain. Snapshot completion/encryption was verified; a full restore
drill has not been performed. Backup identifiers are in the private account audit.

This is a single-host application stack, not high availability. Host failure
affects all apps, while the database and queue remain managed services. Basic
public/readiness checks and the core authenticated beta journey passed; this
does not imply full-feature, peak-load or restore coverage. Five infrastructure
alarms and a monthly budget warning are configured. The owner received the
health-alert email, but subscription confirmation could not be independently
rechecked with deployment credentials; receipt is not proof of confirmation.

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

For the API/worker release, copy both `scripts/deploy-host.sh` and
`scripts/deploy-canary.sh` beside the host compose files, then use
`TAG=sha-<full40> CANARY_TO=<approved-allowlisted-inbox> ./deploy-host.sh --canary`
with `CANARY_API_KEY` supplied securely, never printed or placed in shell history.
The canary uses its own network and loopback port 4100; only the approved inbox
is sent two labelled checks. That inbox must also be confirmed in the key's
workspace, not merely in SES account-wide. Revoke any temporary QA key after
the checks and verify HTTP 401; preserve message/thread evidence.

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
synthetic messages through the production mail provider without explicit owner
approval for the recipient and bounded test; never send real mail from local.

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
