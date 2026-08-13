# Deploy runbook

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
| worker | `i-07f1f375578886933` | worker (compose builds by image name `rootmail-worker`) |
| web | `i-05b681a056fa42fc3` | marketing, dashboard, admin, developers |

The admin console is at **internal.rootmail.io** — there is no
`admin.rootmail.io` record.

## Principals

Anything the *running app* does needs the **`rootmail-app` EC2 role**. Anything
run from the CLI needs the **`claude-depoy` user**. Both S3 (`GetObject` for
inbound mail) and SES (`GetEmailIdentity`) were granted to the wrong one first,
and both failed in ways that looked like working code.
