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

## Working tree must be clean

The script fast-forwards `main`, so it refuses to run with uncommitted changes.
If it reports "Working tree is not clean", it now lists the offending files and
your options:

```bash
# Keep your local edits: stash them, pull, deploy, then re-apply
AUTO_STASH=1 ./scripts/deploy.sh

# Deploy the code you already have checked out, without pulling
SKIP_GIT=1 ./scripts/deploy.sh

# Or handle it yourself
git status          # see what changed
git stash           # or: git checkout -- <file> to discard
```

Tip: keep server-specific tweaks out of tracked files — use `.env` and a
gitignored `docker-compose.override.yaml` — so the tree stays clean across
updates.

## Notes

- The working tree must be clean (see above), or use `AUTO_STASH=1` / `SKIP_GIT=1`.
- **Uploads:** locally-stored files (`STORAGE_TYPE=local`) are only preserved if
  `/data/uploads` is a mounted volume in your compose file. The default prod
  compose assumes S3 storage.

## Restore from a backup

```bash
gunzip -c /data/hive-pal-data/backups/hive-pal-beekeeper-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i "$(docker compose -f docker-compose.prod.yaml ps -q postgres)" \
      psql -U postgres -d beekeeper
```
