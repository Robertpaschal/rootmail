#!/usr/bin/env bash
#
# One-shot host deploy for a single rootmail service.
#
# The prod hosts are tiny (≈4.4 GB disk), so a plain `docker compose pull` ENOSPCs:
# the ~1.4 GB new image can't land next to the old one + build cache. This frees
# disk first (old container + image + build cache), THEN pulls the CI image and
# recreates the service.
#
# Run it FROM the repo root ON the host (where .env.prod + docker-compose.prod.yml live):
#     ./scripts/deploy-host.sh dashboard        # api | worker | marketing | dashboard | admin
#
# Shipping a schema change? Set MIGRATE=1 so the migration runs with the image
# you're deploying (never the one already running):
#     MIGRATE=1 TAG=sha-<sha> ./scripts/deploy-host.sh api
#
# Or drive it over SSH from your laptop:
#     ssh -i key.pem ubuntu@<host> 'cd ~/rootmail && ./scripts/deploy-host.sh dashboard'
#
# Images come from CI (.github/workflows/images.yml → pachal/rootmail-<svc>:latest).
# For PRIVATE Docker Hub repos, `docker login` once on the host first.
set -euo pipefail

SVC="${1:-}"
if [[ -z "$SVC" ]]; then
  echo "usage: $0 <service>   (api | worker | marketing | dashboard | admin)" >&2
  exit 2
fi

NS="${REGISTRY:-pachal}"
TAG="${TAG:-latest}"
IMG="${NS}/rootmail-${SVC}:${TAG}"
DC=(sudo docker compose --env-file .env.prod -f docker-compose.prod.yml)

echo "▸ ${SVC}: freeing disk (stop + remove old container/image + prune cache)"
"${DC[@]}" stop "$SVC" >/dev/null 2>&1 || true
sudo docker rm -f "rootmail-${SVC}-1" >/dev/null 2>&1 || true
sudo docker image rm -f "$IMG" >/dev/null 2>&1 || true
sudo docker image prune -af >/dev/null 2>&1 || true   # safe: keeps images of running containers
sudo docker builder prune -af >/dev/null 2>&1 || true
echo "  disk: $(df -h / | awk 'NR==2{print $4}') free"

# Pull the EXACT image (not `compose pull`, which always takes :latest). Deploying
# by an immutable :sha-<commit> tag — e.g. `TAG=sha-$(git rev-parse HEAD) deploy-host.sh api`
# — avoids the registry race where a deploy reads a stale `:latest` before CI has
# finished pushing the new one. Retag to :latest so the compose `:latest` ref
# recreates onto exactly this image.
echo "▸ ${SVC}: pulling ${IMG}"
sudo docker pull "$IMG"
[ "$TAG" != "latest" ] && sudo docker tag "$IMG" "${NS}/rootmail-${SVC}:latest"

# Migrations run AFTER the pull, so they execute with the image being deployed.
# The trap this closes: `compose run api pnpm db:migrate` uses whatever image is
# currently tagged, so migrating BEFORE the pull silently runs the OLD code's
# migrations folder — it reports success having skipped the new file entirely,
# and the new API then 500s against a table that was never created.
#     MIGRATE=1 TAG=sha-... ./scripts/deploy-host.sh api
if [ "${MIGRATE:-}" = "1" ]; then
  echo "▸ ${SVC}: migrating with the NEW image"
  "${DC[@]}" run --rm --no-deps "$SVC" pnpm db:migrate
fi

echo "▸ ${SVC}: recreating (picks up image + any .env.prod change)"
"${DC[@]}" up -d --force-recreate "$SVC"

sleep 6
"${DC[@]}" ps "$SVC"
echo "▸ ${SVC}: done"
