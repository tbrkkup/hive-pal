# Timeline fixes — back-dating, split edit/delete, persistent undo

Status: **done** on branch `research/colony-split`. Fixes the five issues found
while testing the split feature in production.

## Reported issues

1. A split could only be created "now" — no back-dating.
2. + 3. Changing the split's date from either hive's timeline failed
   ("Failed to update action").
4. "Delete Action" on the split entry failed ("Failed to delete action").
5. Undo was only reachable from the success toast, not later from the UI.

## Root causes

- **(2/3/4)** Two independent problems:
  - The timeline's update/delete mutations sent no explicit `x-apiary-id`, so
    in cross-apiary "view all" mode the ownership check compared against the
    *selected* apiary instead of the hive's own → 403. (Reproduced the backend
    paths against a real PostgreSQL via the e2e suite: with the right apiary
    header both endpoints returned 200 — the backend itself was fine.)
  - Worse: the generic edit dialog didn't know SPLIT, degraded it to `OTHER`,
    and on save the backend replaced the details — **silently destroying the
    split record** (this succeeded, which is scarier than the 403).
- **(1/5)** Simply not built yet.

## Fixes

### Backend (`actions.service.ts`)
- `updateAction` special-cases SPLIT → `updateSplitActionPair`: only **date +
  notes** are editable; `type`/`details` changes are ignored. The new date is
  **mirrored onto the counterpart action** (same `splitId`), and the
  un-completed follow-up reminder is **shifted by the same delta**, so it stays
  `followUpDays` after the split.
- `deleteAction` special-cases SPLIT: deletes **both** timeline entries of the
  pair (a half-logged split is worse than none). Like every other action
  delete, this is log-only — hives/frames/queen stay; full revert remains the
  undo endpoint's job.
- `SPLIT_FOLLOWUP_TITLE` exported from `split.service.ts` for the reminder
  lookup.

### Frontend
- `useUpdateAction` / `useDeleteAction` accept an optional `apiaryId` and send
  it via `apiaryHeaderConfig` — the timeline passes the hive's own apiary, so
  edits work regardless of the selected apiary ("view all" mode).
- `EditActionDialog`: SPLIT mode — date picker + notes only, with an info alert
  explaining that the date syncs to both entries and that reverting is Undo's
  job.
- `SplitWizard`: new **"Date of split"** field (max = today) in the "New hive"
  step; the suggested daughter name follows the chosen date until manually
  edited. Today keeps the exact current time; back-dated splits land at 12:00
  local.
- **Persistent undo**: SPLIT rows in the timeline show an ↩ **Undo split**
  button (both hives). A confirm dialog explains the full revert; if the
  daughter already has own records the server answers 409 and the dialog asks
  again explicitly ("Undo anyway" = force). Undoing from the daughter's page
  navigates back to the mother (the page's hive is gone).
- Delete dialog copy for SPLIT explains pair-delete vs. undo.

## Verification
- **e2e (run against real PostgreSQL 16 in Docker — first time actually
  executed, all green):** 6 tests — the 4 Phase 2 tests plus:
  - *re-dating one side re-dates the pair and shifts the reminder* (also
    asserts a type/details change attempt is ignored),
  - *deleting one SPLIT action removes the pair but keeps the hives*.
- **Playwright CT:** wizard test extended — back-dates the split in step 2,
  asserts the name suggestion follows and the summary shows the date.
- Backend + frontend typecheck, ESLint: clean.
