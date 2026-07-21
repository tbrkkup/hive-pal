# Research: Colony split (Volksteilung) in HivePal

Research into adding a **colony split** feature — taking frames from a mother
colony's brood box into a new brood box on a new bottom board, creating a new
hive while the mother continues with reduced strength (or, alternatively,
dissolving one colony into two).

## Contents
1. [`01-stockkarte-practice.md`](./01-stockkarte-practice.md) — how a split is
   documented on a hive card (Stockkarte).
2. [`02-other-software.md`](./02-other-software.md) — how BEEP (open source) and
   b.tree / other apps document splits.
3. [`03-hivepal-api-assessment.md`](./03-hivepal-api-assessment.md) — existing
   HivePal primitives usable for a split.
4. [`04-roadmap.md`](./04-roadmap.md) — proposed API + UI implementation.
5. [`05-phase1-implementation.md`](./05-phase1-implementation.md) — **Phase 1
   (data model + migration) — implemented.**
6. [`06-phase2-implementation.md`](./06-phase2-implementation.md) — **Phase 2
   (split + undo API) — implemented.**
7. [`07-phase3-implementation.md`](./07-phase3-implementation.md) — **Phase 3
   (frontend split wizard + entry point + hooks) — implemented.**
8. [`08-phase4-implementation.md`](./08-phase4-implementation.md) — **Phase 4
   (provenance badges + German localization) — implemented.**
9. [`09-timeline-fixes.md`](./09-timeline-fixes.md) — **Timeline fixes
   (back-dating, split edit/delete, persistent undo) — implemented.**
10. [`issue.md`](./issue.md) — English feature-request write-up for a future
   upstream PR.

## Executive summary

**1. Stockkarte practice.** A split is inherently a **two-hive, timestamped event
with a parent→child lineage**. Beekeepers record: date, source (mother) colony,
new (daughter) colony, **frames moved** (brood/food), **queen disposition** (old
queen stays vs. goes; how the queenless side is requeened), method (Ableger,
Sammelbrutableger, Flugling/Brutling, Kunstschwarm), reason, and the resulting
strengths — on **both** colonies' cards, with the daughter's card referencing the
mother.

**2. Other software.** BEEP records a split as an **inspection/event** on one hive
(no lineage, no frame accounting). b.tree captures an **establishment "Type"**
(nuc/swarm/…) + queen introduction date, but explicitly lacks parent-hive
lineage, frame-count tracking, and a split workflow. Across apps, the norm is
"new hive with a *how-established* attribute + a note." A **first-class atomic
split** (create daughter **and** debit mother, with lineage + frame accounting +
queen disposition) is rare — a clear **differentiation opportunity**.

**3. HivePal API today.** No split feature exists, but nearly all building blocks
do: `HiveService.create` (seeds boxes) for the daughter; integer `Box.frameCount`
+ the `updateBoxes` delta that auto-logs a `BOX_CONFIGURATION` action for the
mother; **`QueenMovement` + `recordTransfer`** (the closest analog — its dialog
already hints *"e.g., Hive split"*); and the extensible **Action** timeline (add a
`SPLIT` type like the recent `STATUS_CHANGE`). The **`Harvest`/`HarvestHive`** flow
is a *pattern reference only* (per-hive frames + finalize-to-actions) — **not to
be reused**, since its honey-weighing DRAFT→COMPLETED lifecycle doesn't fit an
atomic split. There's even a **"Pagden split" placeholder guide** already in the
app. Gaps: no per-frame model (integer accounting only), standalone actions are
single-hive, no origin field on `Hive`.

**4. Roadmap (recommended).** A dedicated atomic **`POST /hives/:id/split`**
transaction that creates the daughter (with a seeded brood box), debits the
mother's frames, handles queen disposition via `recordTransfer`, and writes a
paired **`SPLIT`** action on both hives, plus an **optional `Hive.parentHiveId`
origin marker** (provenance, *not* biological lineage — you can clear it later).
Driven by a frontend **split wizard**; mother+daughter by default with
"dissolve into two" as a later option. Phased: (0) spec, (1) schema+migration,
(2) backend endpoint, (3) frontend wizard + timeline, (4) provenance UX, (5)
polish. See `04-roadmap.md` for the expanded open questions needing sign-off.

---
*Read-only research; no application code changed. Sources are linked in each file.*
