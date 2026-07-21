# Phase 2 — backend endpoint (implemented)

Status: **done** on branch `research/colony-split`. Adds the split **API** on top
of the Phase 1 data model. No frontend yet (that's Phase 3).

## Endpoints
- **`POST /hives/:id/split`** — perform a colony split. Body = `splitHiveSchema`
  (`packages/shared-schemas/src/hives/hive.schema.ts`):
  ```jsonc
  {
    "date": "2026-05-14T09:00:00.000Z",
    "newHiveName": "Ableger 1",
    "apiaryId": "…",            // optional, default = source hive's apiary
    "framesMoved": [{ "boxId": "…", "count": 3 }],   // from BROOD box(es)
    "queenDisposition": "STAYED_WITH_SOURCE",         // or "MOVED_TO_NEW"
    "queenId": "…",            // optional; auto-resolved for MOVED_TO_NEW
    "followUpDays": 24,        // optional; server default 24; 0 = no reminder
    "notes": "…"
  }
  ```
  Response: `{ splitId, sourceHiveId, newHiveId }`.
- **`DELETE /hives/:id/splits/:splitId?force=true`** — undo a split.

## Behaviour (per review decisions)
Everything runs in **one Prisma transaction** (`SplitService`,
`apps/backend/src/hives/split.service.ts`):
1. Verify the source hive is owned by the caller.
2. Validate `framesMoved`: each `boxId` is a **BROOD** box of the source and
   `count ≤ frameCount` (Dadant → brood frames only; decision Q3).
3. Create the **daughter** hive with **one brood box** = total moved frames,
   variant/frame-size templated from the source's main brood box,
   `parentHiveId = source`, and **`settings` inherited** from the mother (Q8).
4. **Direct `frameCount` decrement** on the source brood box(es) — no
   `updateBoxes`, no `BOX_CONFIGURATION` churn (Q4/decision "Only Split").
5. **Queen** (Q1): `MOVED_TO_NEW` moves the source's active queen to the daughter
   (mother becomes queenless); otherwise the daughter starts queenless. "Introduce
   a mated queen now" is intentionally **not** a feature — done later via the
   queen module.
6. Write the matched **`SPLIT` action pair** (SOURCE + NEW, shared `splitId`).
7. Create a **follow-up `Todo`** for the queenless side, due `date + followUpDays`
   (default **24**, configurable; Q2/Q6).

### Undo (Q7)
Restores the mother's frames, reverts a moved queen, removes the follow-up todo,
deletes the `SPLIT` action pair, and deletes the daughter hive. **Guardrail:**
blocked with `409` if the daughter already has its own records
(inspections / non-split actions) unless `?force=true`.

## Files
- `packages/shared-schemas/src/hives/hive.schema.ts` — `splitHiveSchema`,
  `splitHiveResponseSchema` + types.
- `apps/backend/src/hives/split.service.ts` — `SplitService.split` / `.undo`.
- `apps/backend/src/hives/hive.controller.ts` — the two endpoints.
- `apps/backend/src/hives/hive.module.ts` — registers `SplitService`.
- `apps/backend/src/actions/actions.service.ts` — `SPLIT` wired into
  `mapPrismaToDto`, the delete helpers, and every `include` block (so a split
  renders on the timeline).
- `apps/backend/test/split.e2e-spec.ts` — e2e coverage.

## Verification
- Backend `tsc --noEmit` (incl. tests) — clean. ✅
- ESLint on changed files — clean. ✅
- shared-schemas build + `prisma generate` — clean. ✅
- **e2e test written** (`split.e2e-spec.ts`): split accounting, queen move,
  undo/restore, over-move rejection. **Not run here** (needs Docker/testcontainers
  — run with `pnpm test:e2e` in an environment with Docker).
- **No Playwright**: still no UI to drive; Playwright coverage lands in **Phase 3**
  (the split wizard).

## Not yet (Phase 3+)
- Frontend split **wizard** + timeline/actions-card rendering already exists for a
  `SPLIT` action (added in Phase 1) but has no entry point yet.
- Provenance **badges** (origin/offspring) on the hive detail (Phase 4).
