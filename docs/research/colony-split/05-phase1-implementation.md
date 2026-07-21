# Phase 1 — data model + migration (implemented)

Status: **done** on branch `research/colony-split`. This phase adds only the
**data model** for colony splits — no endpoint and no UI yet (those are Phases
2–3). It mirrors the recently-shipped `STATUS_CHANGE` action end-to-end.

## What was built

### 1. Prisma schema (`apps/backend/prisma/schema.prisma`)
- **`Hive.parentHiveId`** — optional self-relation (provenance marker, *not*
  biological lineage). `onDelete: SetNull` so deleting the mother never cascades
  to the daughter. Reverse relation `offspring Hive[]`. Indexed.
  ```prisma
  parentHiveId String?
  parentHive   Hive?  @relation("HiveSplit", fields: [parentHiveId], references: [id], onDelete: SetNull)
  offspring    Hive[] @relation("HiveSplit")
  ```
- **`ActionType.SPLIT`** — new enum value.
- **`SplitAction`** detail table (1:1 to `Action`, same pattern as
  `StatusChangeAction`). v1 fields only — no method/reason/food breakdown:
  ```prisma
  model SplitAction {
    id                String  @id @default(uuid())
    actionId          String  @unique
    action            Action  @relation(fields: [actionId], references: [id], onDelete: Cascade)
    splitId           String  // groups the SOURCE-side and NEW-side entries of one split
    role              String  // 'SOURCE' | 'NEW'
    counterpartHiveId String? // the other hive in this split
    framesMoved       Int     // number of (brood) frames moved
    queenDisposition  String  // 'STAYED_WITH_SOURCE' | 'MOVED_TO_NEW' | 'NEW_IS_QUEENLESS'
    @@index([splitId])
  }
  ```
  Plus `splitAction SplitAction?` on the `Action` model.

### 2. Migration
`apps/backend/prisma/migrations/20260720195037_add_colony_split/migration.sql` —
adds the enum value, `Hive.parentHiveId` (+ index + self-FK), and the
`SplitAction` table (+ unique `actionId`, `splitId` index, cascade FK).

### 3. Shared schemas (`packages/shared-schemas/src/actions/`)
- `types.ts`: `ActionType.SPLIT`.
- `details.schema.ts`: `splitRoleSchema`, `queenDispositionSchema`,
  `splitActionDetailsSchema` (added to the `actionDetailsSchema` discriminated
  union), and exported types `SplitRole`, `QueenDisposition`,
  `SplitActionDetails`. `splitId`/`role`/`counterpartHiveId` are optional on input
  (the backend fills them), matching the `STATUS_CHANGE` convention.

### 4. Frontend (typecheck-driven only)
`apps/frontend/src/pages/inspection/components/actions-card.tsx` — added the
required `SPLIT` entry to the `Record<ActionType, …>` icon map (a `Record` over
the enum must be exhaustive, exactly like when `STATUS_CHANGE` was added), plus a
small `SplitDetails` renderer + label so a `SPLIT` action already renders if one
exists. No wizard yet.

## Verification
- `npx prisma generate` — schema valid, client generated. ✅
- `pnpm --filter shared-schemas build` — ✅
- Backend `tsc --noEmit` — clean. ✅
- Frontend `pnpm typecheck` — clean. ✅
- **Migration not applied here** (no DB/Docker in this environment) — it is
  written and will run on the next `prisma migrate deploy` / server deploy.
- **No Playwright test in Phase 1**: this phase has no UI or endpoint to drive in
  a browser, so an E2E test isn't meaningful yet. Playwright coverage belongs to
  **Phase 3** (the split wizard). Phase 2 will get backend unit/e2e tests
  (testcontainers) for the transaction (frame accounting, queen disposition, undo).

## NOT in this phase (next up)
- **Phase 2** — `POST /hives/:id/split` transaction + `DELETE /splits/:splitId`
  undo + `ActionsService` wiring for the `SPLIT` case (create/map/delete detail,
  include blocks) + auto follow-up `Todo`.
- **Phase 3** — the frontend split wizard + timeline rendering.
- **Phase 4** — provenance badges (origin/offspring).

> Note: until Phase 2 wires `SPLIT` into `ActionsService.mapPrismaToDto`, a
> `SPLIT` action (none can exist yet — no endpoint) would fall through to the
> `OTHER` mapping. Harmless now; handled in Phase 2.

## Open decision for Phase 2 (needs your input)
See the questions in the chat / at the end of this doc set — the main one is how
much of the **queen handling** to surface in the v1 wizard vs. default the
daughter to queenless. The schema already supports all three dispositions.
