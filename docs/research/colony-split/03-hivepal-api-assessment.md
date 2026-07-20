# Is anything in HivePal's API already useful for a colony split?

> Research note for a possible HivePal "colony split" feature.
> Question 3: What existing primitives in the codebase could a split reuse?

**Short answer:** There is **no split/Ableger feature today**, but HivePal already
has almost every building block a split needs — most importantly a
"unit-moves-between-hives" model (`QueenMovement`), a multi-hive
frame-moving operation precedent (`Harvest`/`HarvestHive`), an extensible typed
**Action** timeline, and a hive-creation path that seeds boxes. A split is
largely an **orchestration** of these.

## Reusable primitives (with file references)

### 1. Create the daughter hive + its brood box — ready to use
`HiveService.create` (`apps/backend/src/hives/hive.service.ts:98–181`) creates a
`Hive` and, in the **same transaction**, `prisma.box.createMany` from a `boxes[]`
array — exactly the "new brood box on a new bottom board" path. Schema:
`createHiveSchema` (`packages/shared-schemas/src/hives/hive.schema.ts:22–33`),
with `apiaryId`, `positionRow/Col`, `status`, `settings`, `boxes[]`.
Variant-compatibility helpers (`box.schema.ts`: `getHiveSystem`,
`getEquivalentVariant`, `findFrameSizeForVariant`) let the daughter's boxes match
the mother's hive system.

### 2. Move frames out of the mother — integer accounting + auto timeline action
There is **no per-frame entity**; frames are an integer `frameCount` per `Box`
(`schema.prisma` `Box` 250–269). "Moving frames" = decrement the source box's
`frameCount` and set the daughter box's `frameCount`. The wholesale
`updateBoxes` path (`hive.service.ts:633–801`, `PUT /hives/:id/boxes`) already
computes `framesAdded/Removed` deltas and **auto-creates a `BOX_CONFIGURATION`
action** — the existing mechanism for logging frame changes on the timeline.

### 3. Queen disposition — `QueenMovement` is the closest analog to a split
`QueenMovement` (`schema.prisma:289–305`) already models *a bee-unit moving
between hives* (`fromHiveId`/`toHiveId` nullable, `movedAt`, `reason`, `notes`).
`QueensService.recordTransfer` (`queens.service.ts:208–294`) transactionally moves
a queen, marks the target's previous queen `REPLACED`, and writes the movement;
`getHiveQueenHistory` (`361–431`) already reconstructs a per-hive queen timeline.
Queen `hiveId` is **nullable** (a queenless split side is representable).
Telling detail: the queen-transfer dialog's reason placeholder literally reads
**"e.g., Hive split, requeen…"** (`queen-transfer-dialog.tsx:134`) — the domain is
already anticipated.

### 4. Multi-hive, frame-moving operation — `Harvest` is the best template
`Harvest` + `HarvestHive` (`schema.prisma:516–549`) model an operation spanning
several hives with **`framesTaken` per hive** and a `DRAFT → IN_PROGRESS →
COMPLETED` state machine that **finalizes into per-hive timeline actions**
(`harvests.service.ts` `create` 30–86, `finalize` 244–324). This is the closest
architectural precedent for a split that spans a **source** hive and a **new**
hive and needs to record frame counts on each. `BatchInspection` (837–871) is a
second "verify a set of hives + ordered join rows" precedent.

### 5. Timeline event — the extensible Action framework
Base `Action` + 1:1 typed detail table per `ActionType`
(`FEEDING…STATUS_CHANGE, OTHER`). A new **`SPLIT`** action type would slot in the
same way `STATUS_CHANGE` recently did. Registration points (from the inventory):
`ActionType` enum (`schema.prisma:587` + `shared-schemas/.../actions/types.ts`),
a new detail model + relation on `Action`, the `actionDetailsSchema` union
(`details.schema.ts`), and the switch arms + `include` blocks in
`actions.service.ts` (`createActionDetails`, `deleteActionDetails`,
`mapPrismaToDto`). **Caveat:** `createStandaloneActionSchema` is **single-hive**
(`action.schema.ts:17–20`) — a split is two-hive, so either a dedicated
split module (harvest-style) or *two linked actions* is needed.

### 6. Status / lifecycle for the "dissolution" model
`HiveStatus` (`ACTIVE, INACTIVE, DEAD, SOLD, UNKNOWN, ARCHIVED`), the
soft-delete→`ARCHIVED` precedent (`hive.service.ts:604–631`), and the
`STATUS_CHANGE` action + `recomputeHiveStatusFromChanges` (`157–172`) are exactly
what the "dissolve the old colony into two new ones" interpretation needs.

### 7. Positioning the new hive
`Hive.positionRow/positionCol` exist (client-chosen). **No backend
next-free-slot helper exists** — the UI would pick a free cell (layout UI:
`hives-layout.tsx`, minimap `hive-minimap.tsx`).

### 8. Prior art already in the app
- **"Pagden split" guide is an explicit placeholder for a future feature** —
  `common.json`: `"title": "Pagden split"`, `"description": "Placeholder for a
  future guide covering the classic artificial swarm split."` Backing route/page
  near `demaree-method-page.tsx`.
- Varroa "Teilen und Behandeln" (flightling/broodling) education in
  `varroa-management-page.tsx`.
- Liebefelder assessment has `split_mid_may` / `split_end_may` thresholds (advice
  on *when* to split) — not an action.

## Mapping: split need → existing primitive
| Split need | Reuse |
|---|---|
| Create daughter hive + brood box | `HiveService.create` + `createHiveSchema` (`boxes[]`) |
| Debit mother's frames + log it | `Box.frameCount` + `updateBoxes` delta → auto `BOX_CONFIGURATION` action |
| Two-hive operation w/ per-hive frames | `Harvest`/`HarvestHive` (`framesTaken`, DRAFT→COMPLETED→finalize-to-actions) |
| Queen disposition | `QueenMovement` + `recordTransfer`; nullable `queen.hiveId`; `getHiveQueenHistory` |
| Timeline entry on both hives | `Action` + new `SPLIT` detail type (STATUS_CHANGE = template) |
| Dissolve/mark old colony | `HiveStatus` + `STATUS_CHANGE` action + soft-delete→ARCHIVED |
| Place new hive | `positionRow/Col` (client-chosen; no backend auto-placement) |

## Gaps to design around
1. **No per-frame model** → frame moves are **integer accounting** (counts, not
   identified frames). Fine for a Stockkarte, but can't track *which* comb moved.
2. **Standalone actions are single-hive** → a split needs a dedicated two-hive
   construct (harvest-style module) **or** two linked `SPLIT` actions
   (one on the mother, one on the daughter, sharing a `splitId`).
3. **No lineage field** on `Hive` today → need a `parentHiveId`/`originHiveId`
   (or a `ColonySplit` join) to make mother⇄daughter traceable.
4. **No backend auto-placement** for the new hive's apiary position.

See `04-roadmap.md` for a concrete implementation proposal built on these.
