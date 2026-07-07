# Updating an existing Hive Pal installation

`scripts/deploy.sh` upgrades a running installation to the latest `main` while
**keeping all data**.

## What it guarantees

- **Your data stays.** Only the backend container is recreated; the `postgres`
  service and its host data volume
  (`docker-compose.prod.yaml` → `/data/hive-pal-data/postgres`) are left in
  place. Schema changes are applied by Prisma migrations that run automatically
  on container start (`apps/backend/docker-entrypoint.sh` →
  `prisma migrate deploy`) — these evolve the schema without dropping data.
- **A backup first.** Before anything changes, the script writes a timestamped
  `pg_dump` to `BACKUP_DIR` (default `/data/hive-pal-data/backups`), so a failed
  migration can be restored.
- **Your code, not a stranger's.** By default the image is **built from source**
  on the server, so it contains exactly what is on your branch. (The stock
  `docker-compose.prod.yaml` points at an upstream registry image — the deploy
  script overrides that with the locally-built one.)

## Usage

From the repository directory on the server:

```bash
./scripts/deploy.sh
```

Common overrides (environment variables):

```bash
# Deploy a different branch
HIVE_PAL_BRANCH=main ./scripts/deploy.sh

# Use a different compose file (e.g. Traefik setup)
HIVE_PAL_COMPOSE=docker-compose.traefik.yaml ./scripts/deploy.sh

# Pull a prebuilt CI image instead of building locally
HIVE_PAL_PULL_IMAGE=ghcr.io/<owner>/hive-pal:main ./scripts/deploy.sh
```

See the header of `scripts/deploy.sh` for the full list of options.

## Local edits are handled for you

Server-specific tweaks to tracked files (a customised `docker-compose.yaml`,
etc.) are normal. By default the script **stashes them before pulling and
restores them right after** — so a single command updates and deploys **with**
your local config, no manual `git stash`/`pull`/`pop` dance:

```bash
HIVE_PAL_COMPOSE=docker-compose.yaml ./scripts/deploy.sh
```

Variants:

```bash
# Require a clean tree instead of auto-stashing (fails if dirty)
NO_STASH=1 ./scripts/deploy.sh

# Deploy the code you already have checked out, without pulling at all
SKIP_GIT=1 ./scripts/deploy.sh
```

If your local edits ever *conflict* with an incoming change, the script stops
before deploying and leaves your work safe in `git stash` for you to resolve.

Tip: to avoid tracked-file edits entirely, keep tweaks in `.env` and a
gitignored `docker-compose.override.yaml`.
- **Uploads:** locally-stored files (`STORAGE_TYPE=local`) are only preserved if
  `/data/uploads` is a mounted volume in your compose file. The default prod
  compose assumes S3 storage.

## Restore from a backup

```bash
gunzip -c /data/hive-pal-data/backups/hive-pal-beekeeper-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i "$(docker compose -f docker-compose.prod.yaml ps -q postgres)" \
      psql -U postgres -d beekeeper
```
