#!/usr/bin/env bash
# Canary release of api + worker. Run on the host from its repository root:
#   TAG=sha-<full40> CANARY_TO=admin@rootmail.io CANARY_API_KEY=… ./scripts/deploy-host.sh --canary
# Optional, as today: MIGRATE=1 MIGRATION_BACKWARD_COMPATIBLE=1. Also CANARY_PORT
# (default 4100) and API_URL (the prod API on this host, default 127.0.0.1:4000).
#
#  1. Migrations first, exactly as today (backward compatible only).
#  2. The new api tag as a separate container on 127.0.0.1:$CANARY_PORT, with the
#     same compose files and env files as prod. Smoke: /health ok, signup, one
#     test send to an allowlisted recipient, its delivery event (proof the
#     tracking configuration set is attached) and its stored HTML.
#  3. On success the canary is removed and the api swaps via deploy-host.sh,
#     which keeps the previous image for rollback. On failure the canary is
#     removed, prod is untouched, and this exits non-zero with the canary's logs.
#  4. The worker has no parallel consumer: a short swap via deploy-host.sh, then
#     a log check and a test send through it; either failing rolls it back.
# Never prints secrets. Makes no SES, SNS or other AWS configuration change.
#
# TODO(worker canary): give the worker a no-consume / queue-prefix flag so a
# canary worker can boot against prod without taking jobs; until then step 4.
set -Eeuo pipefail

ALLOWED_TO=(admin@rootmail.io nnamani.odinakarobert@gmail.com)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NS="${REGISTRY:-pachal}"
TAG="${TAG:-}"
PORT="${CANARY_PORT:-4100}"
PROD_API="${API_URL:-http://127.0.0.1:4000}"
TO="$(printf '%s' "${CANARY_TO:-}" | tr '[:upper:]' '[:lower:]')"

log() { printf '[canary] %s\n' "$*" >&2; }
die() { log "$1"; exit "${2:-1}"; }

[[ $# -eq 0 ]] || die "usage: TAG=sha-<full40> CANARY_TO=<allowlisted> CANARY_API_KEY=… $0 --canary (no other arguments)" 2
[[ "$TAG" =~ ^sha-[0-9a-f]{40}$ ]] || die "An immutable full commit tag is required" 2
[[ -f .env.prod && -f docker-compose.prod.yml ]] || die "Run from the host repository root" 2
allowed=0
for a in "${ALLOWED_TO[@]}"; do [[ "$TO" == "$a" ]] && allowed=1; done
[[ "$allowed" == 1 ]] || die "CANARY_TO must be exactly one of: ${ALLOWED_TO[*]}. Refusing to send anywhere else." 2
[[ -n "${CANARY_API_KEY:-}" ]] || die "CANARY_API_KEY is required for the test send (it is never printed)" 2
[[ "$PORT" =~ ^[0-9]{4,5}$ && "$PORT" != 4000 ]] || die "CANARY_PORT must be a free port other than 4000" 2
if [[ "${MIGRATE:-0}" == 1 && "${MIGRATION_BACKWARD_COMPATIBLE:-0}" != 1 ]]; then
  die "Migrations require explicit MIGRATION_BACKWARD_COMPATIBLE=1 after schema review" 2
fi
for held in .deploy-api.lock .deploy-worker.lock; do
  [[ ! -e "$held" ]] || die "Another deployment holds $held; investigate before retrying"
done
LOCK=".deploy-canary.lock"
mkdir "$LOCK" || die "Another canary holds $LOCK; investigate before retrying"

D=(sudo docker)
C=(--env-file .env.prod -f docker-compose.prod.yml)
# The host overlay carries .env.api.prod / .env.worker.prod and the loopback bindings.
if [[ -f docker-compose.host.yml ]]; then C+=(-f docker-compose.host.yml); fi
dc() { local tag="$1"; shift; sudo env REGISTRY="$NS" TAG="$tag" docker compose "${C[@]}" "$@"; }
CANARY="rootmail-canary-api-$$"
TMP="$(mktemp -d)"
CANARY_UP=0

remove_canary() {
  [[ "$CANARY_UP" == 1 ]] || return 0
  CANARY_UP=0
  if "${D[@]}" inspect "$CANARY" >/dev/null 2>&1; then
    "${D[@]}" rm -f "$CANARY" >/dev/null || { log "Could not remove $CANARY; remove it by hand"; return 1; }
  fi
}
finish() {
  local result=$?
  trap - EXIT
  set +e
  if [[ "$CANARY_UP" == 1 && "$result" != 0 ]]; then
    log "Canary failed; its last 100 log lines follow. Prod was not changed."
    "${D[@]}" logs --tail 100 "$CANARY" >&2
  fi
  remove_canary || result=1
  rm -rf "$TMP"
  rmdir "$LOCK" || result=1
  exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The key goes to curl from a 0600 file, never on a command line or in output.
( umask 077; printf 'Authorization: Bearer %s\n' "$CANARY_API_KEY" > "$TMP/auth" )

# http METHOD URL [JSON] [auth] -> prints the status code; the body is in $TMP/body.
http() {
  local args=(-sS -o "$TMP/body" -w '%{http_code}' --max-time 15 -X "$1" -H 'Content-Type: application/json') code
  if [[ "${4:-}" == auth ]]; then args+=(-H "@$TMP/auth"); fi
  if [[ -n "${3:-}" ]]; then args+=(--data "$3"); fi
  : > "$TMP/body"
  code="$(curl "${args[@]}" "$2" 2>/dev/null)" || true
  printf '%s' "${code:-000}"
}
# First "name":"value" string field of the last body (no secrets are read this way).
field() { { grep -o "\"$1\":\"[^\"]*\"" "$TMP/body" || true; } | head -n 1 | cut -d'"' -f4; }
# The running image's sha-tag for a service, if it has one (for the rollback command).
running_tag() {
  local cid image
  cid="$(dc "$TAG" ps -q "$1")"
  [[ -n "$cid" ]] || return 0
  image="$("${D[@]}" inspect --format '{{.Config.Image}}' "$cid")"
  if [[ "${image##*:}" =~ ^sha-[0-9a-f]{40}$ ]]; then printf '%s' "${image##*:}"; fi
}

health_ok() {
  local i
  for i in $(seq 1 45); do
    if [[ "$(http GET "$1/health")" == 200 ]] && grep -q '^{"status":"ok"' "$TMP/body"; then return 0; fi
    sleep 2
  done
  log "/health on $1 never reported ok"
  return 1
}

# Signup is probed without creating anything we can't account for: the
# allowlisted address normally exists (409) or the closed-beta gate answers (403).
signup_ok() {
  local pw code
  pw="canary-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
  code="$(http POST "$1/v1/auth/signup" "{\"email\":\"$TO\",\"password\":\"$pw\"}")"
  case "$code" in
    409) log "signup ok: validation, rate limit and account lookup answered (account exists)" ;;
    403) log "signup ok: the closed-beta invite gate answered" ;;
    201) log "signup ok: created an account for $TO" ;;
    *) log "signup failed: HTTP $code $(field message)"; return 1 ;;
  esac
}

# One transactional send to the allowlisted address; waits for the delivery
# event, which only arrives through the SES configuration set's event destination.
send_ok() {
  local base="$1" label="$2" code id i status
  code="$(http POST "$base/v1/messages" "{\"to\":\"$TO\",\"type\":\"transactional\",\"subject\":\"rootmail canary ($label) $TAG\",\"html\":\"<p>Canary check for $TAG. <a href=\\\"https://rootmail.io/\\\">rootmail.io</a></p>\",\"text\":\"Canary check for $TAG.\",\"tags\":[\"canary\"],\"idempotency_key\":\"canary-$label-$TAG-$$\"}" auth)"
  [[ "$code" =~ ^20[012]$ ]] || { log "test send refused: HTTP $code $(field message)"; return 1; }
  id="$(field id)"
  [[ -n "$id" ]] || { log "test send returned no message id"; return 1; }
  log "test send queued: $id"
  for i in $(seq 1 "${CANARY_EVENT_WAIT:-60}"); do
    code="$(http GET "$base/v1/messages/$id/audit" "" auth)"
    if [[ "$code" == 200 ]] && grep -q '"event":"delivered"' "$TMP/body"; then break; fi
    status="$(field status)"
    case "$status" in bounced|complained|failed|suppressed) log "test send $id ended $status"; return 1 ;; esac
    if [[ "$i" == "${CANARY_EVENT_WAIT:-60}" ]]; then log "no delivery event for $id (status ${status:-unknown}); is the configuration set attached?"; return 1; fi
    sleep 2
  done
  code="$(http GET "$base/v1/messages/$id" "" auth)"
  [[ "$code" == 200 && -n "$(field provider_message_id)" ]] || { log "stored message $id has no provider id"; return 1; }
  if ! grep -qF 'href=\"https://rootmail.io/\"' "$TMP/body" || grep -qF 'ses:no-track' "$TMP/body"; then
    log "stored HTML for $id is missing the link or opts out of tracking"; return 1
  fi
  log "test send $id delivered with the configuration set; stored HTML keeps its tracked link"
  SENT_IDS+=("$id")
}

worker_logs_ok() {
  local cid
  cid="$(dc "$TAG" ps -q worker)"
  [[ -n "$cid" ]] || { log "no worker container"; return 1; }
  "${D[@]}" logs --since "$1" "$cid" > "$TMP/worker.log" 2>&1 || true
  grep -q 'rootmail worker ready' "$TMP/worker.log" || { log "worker never logged ready"; return 1; }
  if grep -Eq 'worker error:|Unhandled|uncaughtException' "$TMP/worker.log"; then log "worker logged errors since the swap"; return 1; fi
}

SENT_IDS=()
# Quiet validation never prints interpolated secrets.
dc "$TAG" config --quiet
PREV_API="$(running_tag api)"
PREV_WORKER="$(running_tag worker)"
log "Pulling api and worker $TAG while prod keeps running"
"${D[@]}" pull "$NS/rootmail-api:$TAG" >/dev/null
"${D[@]}" pull "$NS/rootmail-worker:$TAG" >/dev/null
if [[ "${MIGRATE:-0}" == 1 ]]; then
  log "Running migrations first (reviewed as backward compatible)"
  dc "$TAG" run --rm --no-deps api pnpm db:migrate
fi

log "Starting the canary api on 127.0.0.1:$PORT"
CANARY_UP=1
dc "$TAG" run -d --no-deps --name "$CANARY" -p "127.0.0.1:$PORT:4000" api >/dev/null
CANARY_URL="http://127.0.0.1:$PORT"
health_ok "$CANARY_URL"
signup_ok "$CANARY_URL"
send_ok "$CANARY_URL" api
remove_canary

log "Canary passed; swapping the api to $TAG"
TAG="$TAG" MIGRATE=0 "$HERE/deploy-host.sh" api
API_ROLLBACK="TAG=${PREV_API:-<previous sha tag>} ./scripts/deploy-host.sh api"

log "Swapping the worker to $TAG (no parallel consumer; short swap, automatic rollback)"
SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if ! TAG="$TAG" MIGRATE=0 "$HERE/deploy-host.sh" worker; then
  log "Worker failed its health check and deploy-host restored the previous image."
  die "The api stays on $TAG. To roll it back: $API_ROLLBACK"
fi
if ! { worker_logs_ok "$SINCE" && send_ok "$PROD_API" worker; }; then
  [[ -s "$TMP/worker.log" ]] && { log "Worker log since the swap (last 50 lines):"; tail -n 50 "$TMP/worker.log" >&2; }
  if [[ -n "$PREV_WORKER" ]]; then
    log "Rolling the worker back to $PREV_WORKER"
    TAG="$PREV_WORKER" MIGRATE=0 "$HERE/deploy-host.sh" worker || log "URGENT: worker rollback failed; the previous image is held by its rootmail-rollback-worker-* container"
  else
    log "URGENT: no sha tag recorded for the previous worker; restore it from its rootmail-rollback-worker-* holder"
  fi
  die "Worker check failed. The api stays on $TAG. To roll it back: $API_ROLLBACK"
fi

cat <<DONE
api and worker verified on $TAG. Canary test sends: ${SENT_IDS[*]}
Rollback (previous containers' images are retained):
  $API_ROLLBACK
  TAG=${PREV_WORKER:-<previous sha tag>} ./scripts/deploy-host.sh worker
Inbound reply check: from $TO, reply to "rootmail canary (worker) $TAG"; within
a minute it should appear in that workspace's Replies. Opens: opening the email
loads the SES open pixel, and GET /v1/messages/<id> then shows opened_at.
DONE
