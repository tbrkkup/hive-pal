# Roadmap: implementing colony split (Volksteilung) in API + UI

> Research note for a possible HivePal "colony split" feature.
> Question 4: A proposed roadmap for API and UI.

## Design principles (from the research)
- A split is a **two-hive, timestamped event** — model it as one operation, not
  two disconnected edits (this is where BEEP/b.tree fall short; see
  `02-other-software.md`).
- **Provenance, not biological lineage.** *(Revised per review.)* The daughter's
  link to the mother records **how it was created** — "split from hive X on
  date Y" — as a historical fact. It is **not** a claim of ongoing genetic
  continuity: introduce a new mated queen and, once the original bees age out,
  the daughter shares nothing with the mother but the drawn comb. So the link is
  an **optional origin marker for record-keeping**, deliberately *not* a
  first-class "family tree". Concretely: an optional `parentHiveId` the user can
  even clear later (e.g. after requeening) if they consider it a fresh colony.
- Reuse existing primitives (`HiveService.create`, `QueenMovement`, the `Action`
  timeline, box `frameCount` accounting) rather than inventing parallel machinery
  (see `03-hivepal-api-assessment.md`). Note: `Harvest` is a *pattern reference
  only*, **not** something to extend — its DRAFT→weigh→finalize lifecycle doesn't
  fit an atomic split (see `03` §4).
- Support **both mental models** the user described:
  - **Mother + daughter** (default): mother continues (reduced), one new daughter.
  - **Dissolution into two**: mother → `ARCHIVED`/`INACTIVE`, two new hives.
  Implement mother+daughter first; "dissolution" is the same operation with an
  extra flag + a second daughter.

## Recommended approach
A **dedicated, atomic split endpoint** (`POST /hives/:id/split`) that performs the
whole operation in one Prisma transaction, recording it as a **paired `SPLIT`
action** (one entry per hive) plus an optional **origin marker**, driven by a
**frontend split wizard**. It reuses `HiveService.create`, the box `frameCount`
accounting, `QueensService.recordTransfer`, and the `Action` framework — i.e. an
orchestration of things that already exist, no new lifecycle machinery.

### Data model (concrete)

**1. Optional origin marker on `Hive`** (self-relation, nullable, `SetNull` so
deleting the mother never cascades to the daughter):
```prisma
model Hive {
  // …
  parentHiveId String?
  parentHive   Hive?   @relation("HiveSplit", fields: [parentHiveId], references: [id], onDelete: SetNull)
  offspring    Hive[]  @relation("HiveSplit")
}
```

**2. `SPLIT` action type + detail table** (mirrors the recent `STATUS_CHANGE`
work exactly). One base `Action` **per hive**, both sharing a `splitId` so the
two entries are a matched pair (mother side + daughter side). Simplified for v1
per decisions — a plain "normal Ableger": total (brood) frames only, no
`method`/`reason`/food breakdown (a free-text reason still fits `Action.notes`):
```prisma
enum ActionType { /* … */ SPLIT }

model SplitAction {
  id                String  @id @default(uuid())
  actionId          String  @unique
  action            Action  @relation(fields: [actionId], references: [id], onDelete: Cascade)
  splitId           String  // groups the source-side and new-side entries
  role              String  // 'SOURCE' | 'NEW'
  counterpartHiveId String? // the other hive in the split (SetNull-safe)
  framesMoved       Int     // number of (brood) frames moved
  queenDisposition  String  // 'STAYED_WITH_SOURCE' | 'MOVED_TO_NEW' | 'NEW_IS_QUEENLESS'
  @@index([splitId])
}
```

**3. Shared Zod** (`packages/shared-schemas/src/actions/details.schema.ts`,
added to the `actionDetailsSchema` discriminated union — same shape as
`statusChangeActionDetailsSchema`; `splitId`/`role`/`counterpartHiveId` are set by
the backend, hence optional on input):
```ts
export const splitRoleSchema = z.enum(['SOURCE', 'NEW']);
export const queenDispositionSchema = z.enum([
  'STAYED_WITH_SOURCE', 'MOVED_TO_NEW', 'NEW_IS_QUEENLESS',
]);
export const splitActionDetailsSchema = z.object({
  type: z.literal(ActionType.SPLIT),
  splitId: z.string().uuid().optional(),
  role: splitRoleSchema.optional(),
  counterpartHiveId: z.string().uuid().nullish(),
  framesMoved: z.number().int().min(0),
  queenDisposition: queenDispositionSchema,
});
```
*(Method/reason/food-frame breakdown intentionally dropped for v1; add later as a
migration if a method picker is wanted. See `05-phase1-implementation.md`.)*

**Why an action-pair and not a `ColonySplit` entity?** A dedicated entity (à la
`Harvest`) buys a DRAFT→COMPLETED lifecycle we don't need — a split happens in one
moment. The action-pair (a) puts the event straight onto **both** hives' existing
timelines, (b) reuses the whole `STATUS_CHANGE` plumbing we just built, and (c)
still carries all the structured fields. A `ColonySplit` entity is only worth it
if we later want a multi-step "planned split" workflow (see open questions).

### Backend endpoint — `POST /hives/:id/split`

**Request** (`splitHiveSchema`; source `hiveId` from the route) — v1 "normal
Ableger", no method/dissolve:
```ts
export const splitHiveSchema = z.object({
  date: z.string().datetime(),
  newHive: z.object({          // the daughter
    name: z.string().min(1),
    apiaryId: z.string().uuid().optional(),   // default = mother's apiary
    // position intentionally omitted (deprioritized)
  }),
  framesMoved: z.array(z.object({             // which brood box(es) to debit
    boxId: z.string().uuid(),
    count: z.number().int().min(1),
  })).min(1),
  queenDisposition: queenDispositionSchema,
  queenId: z.string().uuid().optional(),      // required when disposition = MOVED_TO_NEW
  notes: z.string().optional(),               // free-text reason lives here
});
```
**Response:** `{ splitId, sourceHiveId, newHiveId }`.

**Transaction** (`SplitService.split`, one `prisma.$transaction`) — each step maps
to an existing primitive:
1. **Verify** ownership of the source hive (existing apiary-scope guards) and that
   `framesMoved[*].boxId` belong to it and don't exceed each box's `frameCount`.
2. **Create the daughter** — reuse `HiveService.create` logic: a new `Hive` in the
   target apiary with a seeded **brood box** whose `frameCount = Σ framesMoved`
   (exactly the frames removed — the beekeeper adds more at the next inspection),
   `variant` matched from the mother via `getEquivalentVariant`, `parentHiveId =
   source.id`, **`settings` copied from the mother** (autumn feeding + inspection
   frequency). Name defaults to a suggestion (see the wizard) but is user-editable.
3. **Debit the mother's brood box(es)** — a **direct `frameCount` decrement** on
   the named **brood** box(es) (frames only ever come from the brood nest — see
   *Decisions* Q3). We deliberately **do not** route this through `updateBoxes`
   (which deletes+recreates the whole stack and re-issues box IDs — that's a
   *replace-all* endpoint, fine there because nothing references `Box.id`, but
   needless churn here). Frame-accounting consistency is preserved because the
   removal is recorded in the `SPLIT` action itself (`framesMoved`); optionally
   also emit a `BOX_CONFIGURATION`-style summary for the mother's timeline.
4. **Queen** — reuse `QueensService.recordTransfer`:
   - `MOVED_TO_NEW` → transfer `queenId` to the daughter (mother becomes
     queenless);
   - `STAYED_WITH_SOURCE` → daughter created queenless (`queen.hiveId` stays null);
   - `NEW_IS_QUEENLESS` → same, and the mother keeps its queen.
   For any queenless side, **auto-create a follow-up `Todo`** (the `Todo` model
   exists) dated to the chosen requeening path — e.g. raise-own ≈ check for
   emergence/mating in ~3–4 weeks, given-cell ≈ check laying, introduce-mated ≈
   check acceptance in a few days.
5. **Write the `SPLIT` action pair** — generate one `splitId`; create a `SPLIT`
   action on the mother (`role='SOURCE'`, `counterpartHiveId=newHiveId`) and one
   on the daughter (`role='NEW'`, `counterpartHiveId=source.id`), each with a
   `SplitAction` detail. (Reuses `ActionsService.createActionDetails` extended
   with a `SPLIT` case — same registration points as `STATUS_CHANGE`.)
6. **Statuses** — mother stays `ACTIVE` (v1 is mother+daughter only; the
   `dissolveSource` "two new colonies" path is deferred — see *Decisions* Q2).
7. Emit `hive.created` + action events as usual.

> Every step is an existing operation sequenced inside one transaction — the new
> code is the orchestration + the `SPLIT` action type, not new subsystems.

### Undo (`DELETE /hives/:id/splits/:splitId`)
A split is **reversible** (per *Decisions* Q7). Undo, in one transaction: add the
`framesMoved` back to the mother's brood box, delete the daughter hive (cascades
its boxes/queen-less state), delete the `SPLIT` action pair, revert the queen
movement, and remove the auto-created follow-up `Todo`. Guardrail: only offer undo
while the daughter is essentially untouched (e.g. no inspections/actions logged on
it yet); otherwise show a warning or block, to avoid destroying real records.

### Frontend — "Split colony" wizard
Entry point: a **"Split colony / Volk teilen"** action on the hive detail page
(next to the status dropdown / box configurator). A small stepper:
1. **Frames to move** — reuse the box-configurator frame counters to pick how many
   **brood frames** leave the mother's brood box (live preview of the mother's
   resulting strength). The daughter starts with exactly that many frames.
2. **New hive** — name (**pre-filled suggestion** like `"<mother> · Ableger
   2026-05-14"`, editable), apiary (default = mother's), brood-box variant
   defaulted from the mother; `settings` inherited from the mother. (Apiary
   position skipped — deprioritized.)
3. **Queen** — old queen stays / goes / daughter queenless (+ how it'll be
   requeened): reuse the queen-transfer dialog; a follow-up reminder is created
   automatically for the queenless side.
4. **Meta** — method (preset list, see *Decisions* Q10), reason, date (default
   now), notes.
5. **Confirm** → single call to `POST /hives/:id/split`.
Both hives then show the split on their **timelines** (SPLIT action) and an
**"origin: split from X" / "offspring: Y"** badge on the **hive detail header**
(from `parentHiveId`).

## Phased delivery
- **Phase 0 — spec & schema** *(this research + sign-off)*: finalize
  `SplitAction` fields, the two-model behavior, and i18n keys. Fill in the
  existing **"Pagden split" placeholder** guide.
- **Phase 1 — data model + migration** ✅ **done**: `Hive.parentHiveId`, `SPLIT`
  `ActionType` + `SplitAction` table + shared Zod schemas + migration. See
  `05-phase1-implementation.md`.
- **Phase 2 — backend endpoint** ✅ **done**: `POST /hives/:id/split` transaction
  (create / direct frame decrement / queen move) + SPLIT action pair + auto
  follow-up `Todo` + **undo** `DELETE /hives/:id/splits/:splitId`. e2e tests
  written. See `06-phase2-implementation.md`.
- **Phase 3 — frontend wizard** ✅ **done**: `SplitWizard` (4-step dialog) +
  entry point in the hive-detail action sidebar + `useSplitHive`/`useUndoSplit`
  hooks + a toast "Undo" action. Timeline rendering for the SPLIT action already
  landed in Phase 1/2. Verified with a Playwright component test
  (`split-wizard.spec.tsx`). See `07-phase3-implementation.md`.
- **Phase 4 — provenance UX**: "split from **X**" / "offspring: **Y**" badges &
  links on the hive detail header **and** timeline (no layout dependency).
- **Phase 5 — polish & later**: methods/reasons i18n (DE/EN), fill the **Pagden
  split** guide placeholder, the deferred "dissolution into two" flow, and hooking
  the Liebefelder "when to split" advice to a one-click split.

## Decisions (locked for v1)
All confirmed with the maintainer during review:
1. **Model:** lightweight **action-pair** (no `ColonySplit` entity). ✅
2. **Scope:** **mother + daughter only**; "dissolve into two" deferred. ✅
3. **Frame source:** frames come from the **brood box only** — the maintainer uses
   **Dadant**, where honey frames have different dimensions and are never moved.
   Record **total** brood frames moved; **no food-frame counter** (a = no). ✅
11. **Method:** v1 is a single **"normal Ableger"** (take X frames into a new
    box) — **no method picker** (Ableger/Sammelbrutableger/… deferred). ✅
4. **Frame debit:** **direct `frameCount` decrement** on the brood box, *not*
   `updateBoxes` (keeps box IDs stable; consistency comes from the `SPLIT`
   action). ✅
5. **Daughter box:** exactly **one brood box** sized to the moved frames; more
   frames are added later at the next inspection. ✅
6. **Queen:** offer raise-own / given-cell / introduce-mated, and **auto-create a
   follow-up reminder (`Todo`)** for the queenless side. ✅
7. **Undo:** the split is **reversible** (with a guardrail if the daughter already
   has records). ✅
8. **Inheritance:** the daughter **inherits the mother's `settings`**. ✅
9. **Naming:** **editable suggested** daughter name. ✅
10. **Provenance display:** show the origin/offspring badge on **both** the hive
    detail header **and** the timeline; **no** ability to clear the link needed. ✅
- **Origin vs. lineage:** `parentHiveId` is an optional *provenance* marker, not a
  biological family tree. ✅
- **Apiary position:** skipped (layout unused). ✅

## All questions resolved
Both remaining minor points are now answered: **no food-frame counter**, and v1 is
a **single normal Ableger** (no method presets). The v1 spec is complete.

## Effort estimate (rough)
Phases 1–3 are comparable to the `STATUS_CHANGE` feature but larger (two hives +
box accounting + queen movement): backend ~1 migration + 1 endpoint reusing 3
existing services; frontend ~1 wizard + timeline rendering. Phases 4–5 are
incremental. No third-party dependencies; no per-frame model required for v1.
