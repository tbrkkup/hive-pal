# Roadmap: implementing colony split (Volksteilung) in API + UI

> Research note for a possible HivePal "colony split" feature.
> Question 4: A proposed roadmap for API and UI.

## Design principles (from the research)
- A split is a **two-hive, timestamped, lineage-linked event** — model it as
  such, not as two disconnected edits (this is where BEEP/b.tree fall short; see
  `02-other-software.md`).
- Reuse existing primitives (`HiveService.create`, `QueenMovement`, the `Harvest`
  multi-hive pattern, the `Action` timeline) rather than inventing parallel
  machinery (see `03-hivepal-api-assessment.md`).
- Support **both mental models** the user described:
  - **Mother + daughter** (default): mother continues (reduced), one new daughter.
  - **Dissolution into two**: mother → `ARCHIVED`/`INACTIVE`, two new hives.
  Implement mother+daughter first; "dissolution" is the same operation with an
  extra flag + a second daughter.

## Recommended approach
A **dedicated, atomic split endpoint** (`POST /hives/:id/split`) that performs the
whole operation in one Prisma transaction, plus a **`SPLIT` action type** and a
**lineage link**, driven by a **frontend split wizard**. This is the
harvest-module pattern applied to increase instead of harvest.

### Data model
- **Lineage:** add `parentHiveId String?` (self-relation) to `Hive`, set on the
  daughter. Enables mother⇄daughter navigation and an "origin: split from X" badge.
- **`SPLIT` action type** (mirrors `STATUS_CHANGE`): base `Action` + a
  `SplitAction` detail table. Write **one action on the mother** and **one on the
  daughter**, both sharing a `splitId` (uuid) so they're a matched pair.
  Suggested `SplitAction` fields:
  - `splitId` (groups the pair), `role` (`SOURCE` | `NEW`),
  - `counterpartHiveId`, `framesMoved` (int; optionally `broodFramesMoved` /
    `foodFramesMoved`),
  - `queenDisposition` (`STAYED_WITH_SOURCE` | `MOVED_TO_NEW` | `NEW_IS_QUEENLESS`),
  - `method` (`ABLEGER` | `SAMMELBRUTABLEGER` | `FLUGLING_BRUTLING` |
    `KUNSTSCHWARM` | `OTHER`), `reason` (swarm-prevention / increase / varroa).
- Optional richer alternative: a first-class `ColonySplit` entity (like
  `Harvest`) if a DRAFT→COMPLETED lifecycle is wanted. **Not needed for v1** — a
  split is usually a single atomic act; the action-pair keeps it simpler.

### Backend transaction (`POST /hives/:id/split`)
Validated by a `splitHiveSchema` (source `hiveId` from the route; body: new-hive
name/apiary/position, `framesMoved` per source box, `queenDisposition`, `method`,
`reason`, `date`, `dissolveSource?`). In one `$transaction`:
1. Verify ownership of the source hive (existing apiary-scope guards).
2. **Create the daughter hive** with a brood box seeded from the moved frames
   (reuse `HiveService.create` logic; match variant via `getEquivalentVariant`).
3. **Debit the source box(es)** `frameCount` by the moved amount (reuse the
   `updateBoxes` delta path so a `BOX_CONFIGURATION` action is logged on the
   mother automatically).
4. **Queen disposition** via `QueensService.recordTransfer` semantics: move the
   queen to the daughter, or leave it in the mother and mark the daughter
   queenless (its `queen.hiveId` stays null until requeened).
5. **Write the `SPLIT` action pair** (mother + daughter, shared `splitId`).
6. **Set statuses**: default keeps mother `ACTIVE`; if `dissolveSource`, set
   mother → `ARCHIVED`/`INACTIVE` via a `STATUS_CHANGE` action and create a
   second daughter.
7. Set the daughter's `parentHiveId`.
Emit `hive.created` + the usual events; return `{ sourceHiveId, newHiveId }`.

### Frontend — "Split colony" wizard
Entry point: a **"Split colony / Volk teilen"** action on the hive detail page
(next to the status dropdown / box configurator). A small stepper:
1. **Frames to move** — reuse the box-configurator frame counters to pick how many
   brood/food frames leave the mother (live preview of the mother's resulting
   strength).
2. **New hive** — name, apiary (default = mother's), position (UI picks a free
   cell — no backend helper exists yet), brood-box variant defaulted from mother.
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
- **Phase 4 — lineage UX**: "split from **X**" / "offspring: **Y**" badges &
  links on hive detail and in the apiary layout; optional lineage view.
- **Phase 5 — polish**: methods/reasons i18n (DE/EN), the "dissolution into two"
  flow, and hooking the Liebefelder "when to split" advice to a one-click split.

## Open questions for sign-off
1. **Model:** action-pair (recommended, lightweight) vs. a full `ColonySplit`
   entity with a DRAFT→COMPLETED lifecycle?
2. **Frame granularity:** total frames moved only, or split into brood/food (and
   later per-box)?
3. **Default behavior:** always mother+daughter, with "dissolve into two" as an
   opt-in toggle? (Recommended.)
4. **Auto-placement:** add a backend "next free apiary cell" helper, or leave
   position to the wizard?
5. **Queen requeening options** to offer for a queenless daughter: raise-own /
   given-cell / introduce-mated (affects follow-up reminders).

## Effort estimate (rough)
Phases 1–3 are comparable to the `STATUS_CHANGE` feature but larger (two hives +
box accounting + queen movement): backend ~1 migration + 1 endpoint reusing 3
existing services; frontend ~1 wizard + timeline rendering. Phases 4–5 are
incremental. No third-party dependencies; no per-frame model required for v1.
