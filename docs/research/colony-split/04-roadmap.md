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
two entries are a matched pair (mother side + daughter side):
```prisma
enum ActionType { /* … */ SPLIT }

model SplitAction {
  id               String   @id @default(uuid())
  actionId         String   @unique
  action           Action   @relation(fields: [actionId], references: [id], onDelete: Cascade)
  splitId          String   // groups the mother-side and daughter-side entries
  role             String   // 'SOURCE' | 'NEW'
  counterpartHiveId String? // the other hive in the split (SetNull-safe)
  framesMoved      Int
  broodFramesMoved Int?     // optional finer breakdown …
  foodFramesMoved  Int?     // … (see open question on granularity)
  queenDisposition String   // 'STAYED_WITH_SOURCE' | 'MOVED_TO_NEW' | 'NEW_IS_QUEENLESS'
  method           String   // 'ABLEGER' | 'SAMMELBRUTABLEGER' | 'FLUGLING_BRUTLING' | 'KUNSTSCHWARM' | 'OTHER'
  reason           String?  // 'SWARM_PREVENTION' | 'INCREASE' | 'VARROA' | free text
  @@index([splitId])
}
```

**3. Shared Zod** (`packages/shared-schemas/src/actions/details.schema.ts`,
add to the `actionDetailsSchema` discriminated union — same shape as
`statusChangeActionDetailsSchema`):
```ts
export const splitActionDetailsSchema = z.object({
  type: z.literal(ActionType.SPLIT),
  splitId: z.string().uuid(),
  role: z.enum(['SOURCE', 'NEW']),
  counterpartHiveId: z.string().uuid().nullish(),
  framesMoved: z.number().int().min(0),
  broodFramesMoved: z.number().int().min(0).optional(),
  foodFramesMoved: z.number().int().min(0).optional(),
  queenDisposition: z.enum(['STAYED_WITH_SOURCE', 'MOVED_TO_NEW', 'NEW_IS_QUEENLESS']),
  method: z.enum(['ABLEGER', 'SAMMELBRUTABLEGER', 'FLUGLING_BRUTLING', 'KUNSTSCHWARM', 'OTHER']),
  reason: z.string().optional(),
});
```

**Why an action-pair and not a `ColonySplit` entity?** A dedicated entity (à la
`Harvest`) buys a DRAFT→COMPLETED lifecycle we don't need — a split happens in one
moment. The action-pair (a) puts the event straight onto **both** hives' existing
timelines, (b) reuses the whole `STATUS_CHANGE` plumbing we just built, and (c)
still carries all the structured fields. A `ColonySplit` entity is only worth it
if we later want a multi-step "planned split" workflow (see open questions).

### Backend endpoint — `POST /hives/:id/split`

**Request** (`splitHiveSchema`; source `hiveId` from the route):
```ts
export const splitHiveSchema = z.object({
  date: z.string().datetime(),
  newHive: z.object({          // the daughter
    name: z.string().min(1),
    apiaryId: z.string().uuid().optional(),   // default = mother's apiary
    // position intentionally omitted (deprioritized); can add later
  }),
  framesMoved: z.array(z.object({             // which source box(es) to debit
    boxId: z.string().uuid(),
    count: z.number().int().min(1),
    broodCount: z.number().int().min(0).optional(),
    foodCount: z.number().int().min(0).optional(),
  })).min(1),
  queenDisposition: z.enum(['STAYED_WITH_SOURCE', 'MOVED_TO_NEW', 'NEW_IS_QUEENLESS']),
  queenId: z.string().uuid().optional(),      // required when disposition = MOVED_TO_NEW
  method: z.enum(['ABLEGER', 'SAMMELBRUTABLEGER', 'FLUGLING_BRUTLING', 'KUNSTSCHWARM', 'OTHER']),
  reason: z.string().optional(),
  notes: z.string().optional(),
  dissolveSource: z.boolean().default(false),
});
```
**Response:** `{ splitId, sourceHiveId, newHiveId }`.

**Transaction** (`SplitService.split`, one `prisma.$transaction`) — each step maps
to an existing primitive:
1. **Verify** ownership of the source hive (existing apiary-scope guards) and that
   `framesMoved[*].boxId` belong to it and don't exceed each box's `frameCount`.
2. **Create the daughter** — reuse `HiveService.create` logic: a new `Hive` in the
   target apiary with a seeded **brood box** whose `frameCount = Σ framesMoved`,
   `variant` matched from the mother via `getEquivalentVariant`, `parentHiveId =
   source.id`.
3. **Debit the mother's box(es)** — reduce each source `box.frameCount` by
   `count`. Route this through the existing `updateBoxes` delta path so a
   `BOX_CONFIGURATION` action is logged on the mother automatically (frames
   removed), keeping frame accounting consistent with the rest of the app.
4. **Queen** — reuse `QueensService.recordTransfer`:
   - `MOVED_TO_NEW` → transfer `queenId` to the daughter (mother becomes
     queenless);
   - `STAYED_WITH_SOURCE` → daughter created queenless (`queen.hiveId` stays null);
   - `NEW_IS_QUEENLESS` → same, and the mother keeps its queen.
5. **Write the `SPLIT` action pair** — generate one `splitId`; create a `SPLIT`
   action on the mother (`role='SOURCE'`, `counterpartHiveId=newHiveId`) and one
   on the daughter (`role='NEW'`, `counterpartHiveId=source.id`), each with a
   `SplitAction` detail. (Reuses `ActionsService.createActionDetails` extended
   with a `SPLIT` case — same registration points as `STATUS_CHANGE`.)
6. **Statuses** — default keeps the mother `ACTIVE`. If `dissolveSource`: set the
   mother → `ARCHIVED`/`INACTIVE` via a `STATUS_CHANGE` action and create a
   **second** daughter carrying the remaining frames (the "two new colonies" model).
7. Emit `hive.created` + action events as usual.

> All six steps are existing operations sequenced inside one transaction — the new
> code is the orchestration + the `SPLIT` action type, not new subsystems.

### Frontend — "Split colony" wizard
Entry point: a **"Split colony / Volk teilen"** action on the hive detail page
(next to the status dropdown / box configurator). A small stepper:
1. **Frames to move** — reuse the box-configurator frame counters to pick how many
   brood/food frames leave the mother (live preview of the mother's resulting
   strength).
2. **New hive** — name, apiary (default = mother's), brood-box variant defaulted
   from the mother. (Apiary position skipped — deprioritized per review; can be
   set later in the layout if ever needed.)
3. **Queen** — old queen stays / goes / daughter queenless (+ how it'll be
   requeened): reuse the queen-transfer dialog.
4. **Meta** — method, reason, date (default now), notes; optional
   "dissolve mother into two" toggle.
5. **Confirm** → single call to `POST /hives/:id/split`.
Both hives then show the split on their **timelines** (SPLIT action) and an
**"origin / offspring"** link (from `parentHiveId`).

## Phased delivery
- **Phase 0 — spec & schema** *(this research + sign-off)*: finalize
  `SplitAction` fields, the two-model behavior, and i18n keys. Fill in the
  existing **"Pagden split" placeholder** guide.
- **Phase 1 — data model + migration**: `Hive.parentHiveId`, `SPLIT` `ActionType`
  + `SplitAction` table + shared Zod schemas. (Mirrors the recent `STATUS_CHANGE`
  work end-to-end.)
- **Phase 2 — backend endpoint**: `POST /hives/:id/split` transaction reusing
  create / updateBoxes / recordTransfer; the SPLIT action pair; `dissolveSource`.
  Unit/e2e tests (testcontainers) for frame accounting + queen disposition.
- **Phase 3 — frontend wizard**: the stepper above + timeline rendering for the
  SPLIT action (icon/label, from→to hive, frames moved) in
  `timeline-event-list.tsx` and `actions-card.tsx`.
- **Phase 4 — provenance UX**: optional "split from **X**" / "offspring: **Y**"
  badges & links on the hive detail header/timeline (no layout dependency);
  ability to clear the origin link.
- **Phase 5 — polish**: methods/reasons i18n (DE/EN), the "dissolution into two"
  flow, and hooking the Liebefelder "when to split" advice to a one-click split.

## Resolved from review
- **Origin vs. lineage:** keep an **optional `parentHiveId`** as a provenance
  marker only (not a biological family tree). ✅ *(you liked `parentHiveId`.)*
- **Apiary position:** **skip it** — layout isn't used in practice. ✅

## Open questions for sign-off
Please react to each — even a one-word steer helps.

1. **Model:** action-pair (recommended, lightweight) vs. a full `ColonySplit`
   entity with a DRAFT→COMPLETED lifecycle? *(Recommend: action-pair.)*
2. **v1 scope:** ship **mother+daughter only** first and add "dissolve into two"
   later, or build both from the start? *(Recommend: mother+daughter first.)*
3. **Frame granularity:** record only **total** frames moved, or brood/food
   split, or (later) per-source-box counts? *(Recommend: total for v1, optional
   brood/food.)*
4. **Frame debit mechanism:** route the mother's frame reduction through the
   existing `updateBoxes` path — which **auto-logs a `BOX_CONFIGURATION` action**
   but also **rewrites box IDs** (it deletes+recreates boxes) — or do a lighter
   **direct `frameCount` decrement** and log the removal ourselves? *(Trade-off:
   consistency vs. keeping box IDs stable.)*
5. **Daughter box setup:** always create **one brood box** sized to the moved
   frames, or let the wizard configure the daughter's **full box stack**?
   *(Recommend: one brood box for v1.)*
6. **Queen options for a queenless daughter:** offer raise-own / given-cell /
   introduce-mated — and should choosing one **auto-create a follow-up
   reminder/todo** (e.g. "check mating in ~24 days")?
7. **Reversibility:** should a split be **undoable** (delete the split →
   restore the mother's frames, remove/mark the daughter), à la harvest `reopen`?
   Or is it a one-way record?
8. **Daughter inherits settings?** copy the mother's `settings` (autumn feeding,
   inspection frequency) to the daughter, or start from defaults?
9. **Naming:** auto-suggest a daughter name (e.g. `"<mother> · Ableger
   2026-05-14"`) or require manual entry?
10. **Methods that matter to you:** which of Ableger / Sammelbrutableger /
    Flugling-Brutling / Kunstschwarm should be first-class presets (affects UI +
    i18n)? Any others you use?
11. **Provenance display:** where do you want the "origin: split from X" /
    "offspring: Y" badges — hive detail header, timeline, both? And should the
    user be able to **clear** the origin link later (your "it's a new colony"
    point)?

## Effort estimate (rough)
Phases 1–3 are comparable to the `STATUS_CHANGE` feature but larger (two hives +
box accounting + queen movement): backend ~1 migration + 1 endpoint reusing 3
existing services; frontend ~1 wizard + timeline rendering. Phases 4–5 are
incremental. No third-party dependencies; no per-frame model required for v1.
