#!/usr/bin/env bash
#
# deploy.sh — update an existing Hive Pal installation to the latest main/master
# while preserving all data.
#
# What it does, in order:
#   1. Verifies prerequisites (docker + compose, clean git tree).
#   2. Fast-forwards the checkout to the target branch (default: main).
#   3. Backs up the PostgreSQL database (pg_dump) before anything changes.
#   4. Gets the new app image — built from source by default, so it always
#      contains exactly what is in your branch (set HIVE_PAL_PULL_IMAGE to pull
#      a prebuilt CI image instead).
#   5. Recreates the backend container with the new image via docker compose.
#      Prisma migrations run automatically on start (docker-entrypoint.sh runs
#      `prisma migrate deploy`), evolving the schema WITHOUT dropping data.
#   6. Waits for the backend health check to go green.
#
# Data safety:
#   - PostgreSQL data lives in the host volume referenced by the compose file
#     (docker-compose.prod.yaml → /data/hive-pal-data/postgres). It is never
#     touched: only the backend container is recreated, the postgres service and
#     its volume stay in place.
#   - A timestamped SQL backup is taken before the update (see BACKUP_DIR), so a
#     failed migration can be restored.
#   - NOTE: locally-stored uploads (STORAGE_TYPE=local) are only preserved if
#     /data/uploads is a mounted volume in your compose file. The default prod
#     compose assumes S3 storage. Mount a volume if you rely on local uploads.
#
# Usage:
#   scripts/deploy.sh
#
# Configuration (environment variables, with defaults):
#   HIVE_PAL_DIR        Path to the repo checkout            (default: repo of this script)
#   HIVE_PAL_BRANCH     Branch to deploy                     (default: main)
#   HIVE_PAL_COMPOSE    Compose file                         (default: docker-compose.prod.yaml)
#   HIVE_PAL_ENV        Env file passed to compose           (default: .env, if present)
#   HIVE_PAL_IMAGE      Local image tag to build/run         (default: hive-pal:local)
#   HIVE_PAL_PULL_IMAGE Pull this image instead of building  (e.g. ghcr.io/tbrkkup/hive-pal:main)
#   BACKUP_DIR          Where DB dumps are written           (default: /data/hive-pal-data/backups)
#   PG_SERVICE          Postgres service name in compose     (default: postgres)
#   BACKEND_SERVICE     Backend service name in compose      (default: backend)
#   PG_USER / PG_DB     DB credentials for the dump          (default: postgres / beekeeper)
#   SKIP_BACKUP=1       Skip the pre-deploy DB backup        (not recommended)
#   SKIP_GIT=1          Do not touch git (deploy current checkout as-is)
#   HEALTH_TIMEOUT      Seconds to wait for health           (default: 180)
#
set -euo pipefail

# --- Resolve repo dir (default: parent of this script) --------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HIVE_PAL_DIR="${HIVE_PAL_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

HIVE_PAL_BRANCH="${HIVE_PAL_BRANCH:-main}"
HIVE_PAL_COMPOSE="${HIVE_PAL_COMPOSE:-docker-compose.prod.yaml}"
HIVE_PAL_IMAGE="${HIVE_PAL_IMAGE:-hive-pal:local}"
HIVE_PAL_PULL_IMAGE="${HIVE_PAL_PULL_IMAGE:-}"
BACKUP_DIR="${BACKUP_DIR:-/data/hive-pal-data/backups}"
PG_SERVICE="${PG_SERVICE:-postgres}"
BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-beekeeper}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[deploy] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

cd "${HIVE_PAL_DIR}" || die "Cannot cd into ${HIVE_PAL_DIR}"

# --- Resolve docker compose command --------------------------------------------
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "docker compose (v2) or docker-compose is required."
fi
command -v docker >/dev/null 2>&1 || die "docker is required."
[ -f "${HIVE_PAL_COMPOSE}" ] || die "Compose file not found: ${HIVE_PAL_COMPOSE}"

# Assemble base compose args: compose file + optional env file.
COMPOSE_ARGS=(-f "${HIVE_PAL_COMPOSE}")
ENV_FILE="${HIVE_PAL_ENV:-.env}"
if [ -f "${ENV_FILE}" ]; then
  COMPOSE_ARGS+=(--env-file "${ENV_FILE}")
  log "Using env file: ${ENV_FILE}"
fi

# --- 1. Update the checkout -----------------------------------------------------
if [ "${SKIP_GIT:-0}" != "1" ]; then
  command -v git >/dev/null 2>&1 || die "git is required (or set SKIP_GIT=1)."
  if [ -n "$(git status --porcelain)" ]; then
    die "Working tree is not clean. Commit/stash your changes or set SKIP_GIT=1."
  fi
  log "Fetching and fast-forwarding to origin/${HIVE_PAL_BRANCH} ..."
  git fetch --prune origin "${HIVE_PAL_BRANCH}"
  git checkout "${HIVE_PAL_BRANCH}"
  git merge --ff-only "origin/${HIVE_PAL_BRANCH}" \
    || die "Cannot fast-forward ${HIVE_PAL_BRANCH}; resolve divergence manually."
  log "Now at $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"
else
  warn "SKIP_GIT=1 — deploying the current checkout as-is."
fi

# --- 2. Back up the database ----------------------------------------------------
backup_database() {
  local pg_cid
  pg_cid="$("${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" ps -q "${PG_SERVICE}" 2>/dev/null || true)"
  if [ -z "${pg_cid}" ]; then
    warn "Postgres container not running — skipping backup (fresh install?)."
    return 0
  fi
  mkdir -p "${BACKUP_DIR}"
  local ts stamp out
  ts="$(date +%Y%m%d-%H%M%S)"
  out="${BACKUP_DIR}/hive-pal-${PG_DB}-${ts}.sql.gz"
  log "Backing up database '${PG_DB}' → ${out}"
  if docker exec "${pg_cid}" pg_dump -U "${PG_USER}" "${PG_DB}" | gzip > "${out}"; then
    log "Backup complete ($(du -h "${out}" | cut -f1))."
  else
    rm -f "${out}"
    die "Database backup failed — aborting before touching anything."
  fi
}
if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  backup_database
else
  warn "SKIP_BACKUP=1 — no database backup taken."
fi

# --- 3. Get the new image -------------------------------------------------------
# We run the backend from HIVE_PAL_IMAGE via a generated compose override so the
# base compose file (which may point at a registry image) stays untouched.
if [ -n "${HIVE_PAL_PULL_IMAGE}" ]; then
  log "Pulling prebuilt image: ${HIVE_PAL_PULL_IMAGE}"
  docker pull "${HIVE_PAL_PULL_IMAGE}" || die "Failed to pull ${HIVE_PAL_PULL_IMAGE}"
  RUN_IMAGE="${HIVE_PAL_PULL_IMAGE}"
else
  log "Building image ${HIVE_PAL_IMAGE} from source (this can take a few minutes) ..."
  docker build -t "${HIVE_PAL_IMAGE}" -f Dockerfile . || die "Image build failed."
  RUN_IMAGE="${HIVE_PAL_IMAGE}"
fi

OVERRIDE_FILE="$(mktemp -t hive-pal-deploy-override.XXXXXX.yaml)"
trap 'rm -f "${OVERRIDE_FILE}"' EXIT
cat > "${OVERRIDE_FILE}" <<YAML
services:
  ${BACKEND_SERVICE}:
    image: ${RUN_IMAGE}
    pull_policy: never
YAML
COMPOSE_ARGS+=(-f "${OVERRIDE_FILE}")

# --- 4. Recreate the backend (migrations run on start) --------------------------
log "Starting updated stack (postgres data volume is preserved) ..."
"${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" up -d --remove-orphans

# --- 5. Wait for health ---------------------------------------------------------
backend_cid="$("${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" ps -q "${BACKEND_SERVICE}")"
[ -n "${backend_cid}" ] || die "Backend container did not come up."

log "Waiting up to ${HEALTH_TIMEOUT}s for the backend to become healthy ..."
elapsed=0
while [ "${elapsed}" -lt "${HEALTH_TIMEOUT}" ]; do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "${backend_cid}" 2>/dev/null || echo unknown)"
  state="$(docker inspect --format '{{.State.Status}}' "${backend_cid}" 2>/dev/null || echo unknown)"
  case "${status}" in
    healthy)
      log "Backend is healthy. Deploy complete. 🎉"
      exit 0
      ;;
    no-healthcheck)
      if [ "${state}" = "running" ]; then
        log "Backend is running (no healthcheck defined). Deploy complete."
        exit 0
      fi
      ;;
  esac
  if [ "${state}" = "exited" ] || [ "${state}" = "dead" ]; then
    warn "Backend container is '${state}'. Recent logs:"
    "${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" logs --tail=60 "${BACKEND_SERVICE}" >&2 || true
    die "Backend failed to start. Data is untouched; restore from ${BACKUP_DIR} if needed."
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done

warn "Backend did not report healthy within ${HEALTH_TIMEOUT}s. Recent logs:"
"${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" logs --tail=60 "${BACKEND_SERVICE}" >&2 || true
die "Health check timed out. The app may still be starting; check 'docker compose ps' and logs."
