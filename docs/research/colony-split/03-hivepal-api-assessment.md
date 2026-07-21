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

### 4. `Harvest` — a code *pattern* to learn from, NOT a feature to reuse
> ⚠️ Clarification (per review feedback): the **harvest feature is for the honey
> harvest** and should **not** be repurposed for splits. It is cited here only as
> an existing *code pattern* ("a multi-hive operation with per-hive frame counts
> that finalizes into timeline actions"). We would build the split's own tables —
> the point is the shape, not the entity. And even that shape is heavier than a
> split needs (see the verdict at the end).

**How the harvest flow actually works** (`harvests.service.ts`,
`schema.prisma:516–549`):
- `Harvest` belongs to an **apiary**, has a `date`, a `status`
  (`DRAFT → IN_PROGRESS → COMPLETED`) and a `totalWeight`. `HarvestHive` is a join
  row per contributing hive holding **`framesTaken`** and the computed
  `honeyAmount`/`honeyPercentage`.
- **`create`** (→ DRAFT, lines 30–86): pick hives and how many honey frames were
  taken from each; verifies every hive belongs to the apiary.
- **`setWeight`** (→ IN_PROGRESS, 179–242): enter the **total extracted weight**;
  `calculateHoneyDistribution` (496–536) splits that weight across the hives
  **proportionally to `framesTaken`**.
- **`finalize`** (→ COMPLETED, 244–324): writes **one `HARVEST` action +
  `HarvestAction` detail per hive** ("Harvested X kg (N frames)") so each hive's
  timeline shows it. `reopen` (326–390) deletes those actions again.

**Why this is only *partly* relevant to a split:** the genuinely reusable idea is
the last step — *record a per-hive frame count and write a timeline action per
hive*. But a harvest's whole reason for the `DRAFT → weigh → distribute →
finalize` **lifecycle** is that you don't know the honey weight until after
extraction, so it's split over time. **A colony split has no such deferred
measurement** — it's a single atomic act ("move these frames now"). So the
harvest **state machine is overkill** for a split; only the per-hive-frames +
finalize-to-actions concept carries over, and that concept is already available
more cheaply from the `Action` framework (§5) + the box `frameCount` accounting
(§2). `BatchInspection` (837–871) is a second "verify a set of hives" precedent
with the same caveat.

**Verdict:** treat harvest as *prior art that proves the per-hive-frames +
timeline-action pattern exists*, not as a base to extend. The split should be a
small, atomic operation — see the recommended **action-pair** design in
`04-roadmap.md`.

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

### 7. Positioning the new hive — **low priority** (deprioritized per review)
`Hive.positionRow/positionCol` exist and are client-chosen; there is no backend
next-free-slot helper. Per review feedback the apiary layout isn't used in
practice, so **the split can simply leave the new hive's position unset** and we
skip any auto-placement work. Noted only for completeness.

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
| Two-hive event w/ per-hive frames | **Recommended: a paired `SPLIT` action** (one per hive, shared `splitId`). `Harvest` shows the per-hive-frames pattern exists, but its DRAFT→weigh→finalize lifecycle is overkill for an atomic split |
| Queen disposition | `QueenMovement` + `recordTransfer`; nullable `queen.hiveId`; `getHiveQueenHistory` |
| Timeline entry on both hives | `Action` + new `SPLIT` detail type (STATUS_CHANGE = template) |
| Dissolve/mark old colony | `HiveStatus` + `STATUS_CHANGE` action + soft-delete→ARCHIVED |
| Place new hive | `positionRow/Col` — **optional/deprioritized**; leave unset |

## Gaps to design around
1. **No per-frame model** → frame moves are **integer accounting** (counts, not
   identified frames). Fine for a Stockkarte, but can't track *which* comb moved.
2. **Standalone actions are single-hive** (`createStandaloneActionSchema.hiveId`)
   → a split is two-hive. **Recommended:** two linked `SPLIT` actions (mother +
   daughter, sharing a `splitId`) written by one dedicated endpoint. A heavier
   `Harvest`-style entity is possible but unnecessary (see §4 verdict).
3. **No origin field** on `Hive` → an optional `parentHiveId` records the
   daughter's **provenance** (how it was created), *not* an ongoing biological
   lineage — see the note in `04-roadmap.md`.
4. **No backend auto-placement** — not needed; positioning is deprioritized.

See `04-roadmap.md` for a concrete implementation proposal built on these.
