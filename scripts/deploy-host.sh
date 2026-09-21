#!/usr/bin/env bash
# Run on the host from its repository root:
# TAG=sha-<full40> ./scripts/deploy-host.sh dashboard
# Pull first, retain one rollback image, replace only this service, then verify.
set -Eeuo pipefail

SVC="${1:-}"
case "$SVC" in api|worker|marketing|developers|dashboard|admin) ;; *)
  echo "usage: TAG=sha-<full40> $0 <api|worker|marketing|developers|dashboard|admin>" >&2; exit 2 ;;
esac
NS="${REGISTRY:-pachal}"
TAG="${TAG:-}"
[[ "$TAG" =~ ^sha-[0-9a-f]{40}$ ]] || { echo "An immutable full commit tag is required" >&2; exit 2; }
[[ -f .env.prod && -f docker-compose.prod.yml ]] || { echo "Run from the host repository root" >&2; exit 2; }
if [[ "${MIGRATE:-0}" == 1 ]]; then
  [[ "$SVC" == api && "${MIGRATION_BACKWARD_COMPATIBLE:-0}" == 1 ]] || {
    echo "Migrations require api and explicit MIGRATION_BACKWARD_COMPATIBLE=1 after schema review" >&2; exit 2;
  }
fi

LOCK=".deploy-$SVC.lock"
mkdir "$LOCK" || { echo "Another deployment holds $LOCK; investigate before retrying" >&2; exit 1; }
D=(sudo docker)
C=(--env-file .env.prod -f docker-compose.prod.yml)
# Consolidated hosts retain distinct backend environments and loopback bindings.
# Use the same overlay for validation, replacement, health checks and rollback.
if [[ -f docker-compose.host.yml ]]; then C+=(-f docker-compose.host.yml); fi
dc() { local tag="$1"; shift; sudo env REGISTRY="$NS" TAG="$tag" docker compose "${C[@]}" "$@"; }
PREVIOUS_ID=""
HOLDER=""
SWITCHED=0
SUCCESS=0
ROLLBACK_TAG="rollback-$SVC-$(date -u +%Y%m%dT%H%M%SZ)-$$"

healthy() {
  local cid state health restarts
  cid="$(dc "$1" ps -q "$SVC")"
  [[ -n "$cid" ]] || return 1
  state="$("${D[@]}" inspect --format '{{.State.Status}}' "$cid")"
  health="$("${D[@]}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$cid")"
  restarts="$("${D[@]}" inspect --format '{{.RestartCount}}' "$cid")"
  [[ "$state" == running && "$health" == healthy && "$restarts" == 0 ]]
}
wait_healthy() {
  local i
  for i in $(seq 1 45); do
    if healthy "$1"; then return 0; fi
    sleep 2
  done
  return 1
}
finish() {
  local result=$?
  trap - EXIT
  # A failed recovery command must not skip the alert or lock cleanup.
  set +e
  if [[ "$SWITCHED" == 1 && "$SUCCESS" != 1 && -n "$PREVIOUS_ID" ]]; then
    echo "New release failed verification; restoring previous image" >&2
    if "${D[@]}" tag "$PREVIOUS_ID" "$NS/rootmail-$SVC:$ROLLBACK_TAG" &&
       dc "$ROLLBACK_TAG" up -d --no-deps --no-build --pull never --force-recreate "$SVC" && wait_healthy "$ROLLBACK_TAG"; then
      echo "Previous image restored and healthy; deployment still reports failure" >&2
    else
      echo "URGENT: automatic rollback could not be verified; retained image $PREVIOUS_ID" >&2
    fi
    result=1
  fi
  rmdir "$LOCK" || result=1
  exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Quiet validation never prints interpolated secrets.
dc "$TAG" config --quiet
CID="$(dc "$TAG" ps -q "$SVC")"
if [[ -n "$CID" ]]; then PREVIOUS_ID="$("${D[@]}" inspect --format '{{.Image}}' "$CID")"; fi
echo "Pulling $NS/rootmail-$SVC:$TAG while the current service remains running"
"${D[@]}" pull "$NS/rootmail-$SVC:$TAG"
NEW_ID="$("${D[@]}" image inspect --format '{{.Id}}' "$NS/rootmail-$SVC:$TAG")"
if [[ -n "$PREVIOUS_ID" ]]; then
  HOLDER="rootmail-$ROLLBACK_TAG"
  # Never started: pins the old image against image-prune cron jobs.
  "${D[@]}" create --name "$HOLDER" --label "rootmail.rollback.service=$SVC" "$PREVIOUS_ID" >/dev/null
fi
if [[ "${MIGRATE:-0}" == 1 ]]; then
  dc "$TAG" run --rm --no-deps "$SVC" pnpm db:migrate
fi
SWITCHED=1
dc "$TAG" up -d --no-deps --no-build --pull never --force-recreate "$SVC"
wait_healthy "$TAG" || { echo "Health verification timed out" >&2; exit 1; }
CID="$(dc "$TAG" ps -q "$SVC")"
[[ "$("${D[@]}" inspect --format '{{.Image}}' "$CID")" == "$NEW_ID" ]] || {
  echo "Running image does not match the pulled release" >&2; exit 1;
}
SUCCESS=1
# Only retire earlier rollback holders created by this script. No force, volumes,
# broad image prune or application-container deletion. Keep this release's predecessor.
while read -r old; do
  [[ -n "$old" ]] || continue
  [[ "$("${D[@]}" inspect --format '{{.Name}}' "$old")" == "/$HOLDER" ]] && continue
  [[ "$("${D[@]}" inspect --format '{{.State.Status}}' "$old")" == created ]] || continue
  "${D[@]}" rm "$old" >/dev/null
done < <("${D[@]}" ps -aq --filter "label=rootmail.rollback.service=$SVC")
echo "$SVC verified on $TAG. Previous image retained in ${HOLDER:-none}."
