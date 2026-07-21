# Phase 3 — frontend split wizard (implemented)

Status: **done** on branch `research/colony-split`. Adds the **UI** on top of the
Phase 2 API: a guided dialog to perform a split, an entry point, mutation hooks,
and an undo affordance. Verified with a Playwright component test.

## What landed

### 1. `SplitWizard` — a 4-step dialog
`apps/frontend/src/pages/hive/hive-detail-page/split/split-wizard.tsx`

A `Dialog` with a step progress bar and these steps:

1. **Frames** — a stepper (`− n +`) bounded to `1 … broodBox.frameCount`, with a
   live before/after preview (`mother = maxFrames − n`, `new hive = n`). Defaults
   to `min(3, maxFrames)`. Only the **first BROOD box** is offered as the source
   (Dadant → brood frames only; matches the Phase 2 decision).
2. **New hive** — an editable, pre-filled name
   (`"{hive.name} · Ableger {yyyy-MM-dd}"`). Copy notes it inherits the mother's
   settings and stays in the same apiary.
3. **Queen** — two cards: *queen stays with the mother* (default) or *move the
   queen to the new hive* (disabled when the hive has no `activeQueen`), plus a
   configurable follow-up reminder in **days** (default **24**). Introducing a
   mated queen is deliberately **not** here — that's a later, separate flow.
4. **Confirm** — a summary table (frames moved, mother after, new-hive name, queen
   disposition, reminder) and the **Split colony** action button.

On confirm it calls `useSplitHive` and, on success, closes and fires a
`toast.success` with an **Undo** action wired to `useUndoSplit` — so an accidental
split is one click to reverse (backed by the Phase 2 guardrailed undo).

### 2. Entry point
`apps/frontend/src/pages/hive/hive-detail-page/action-sidebar.tsx`

A **“Split colony”** menu item (lucide `Split` icon) in the hive-detail **Hive
Actions** group, right after *Add Queen*. It opens the wizard for the loaded hive
(`disabled` until the hive query resolves). This is the placement the user
expected — under `hive/:id` — so a split is initiated from the colony it acts on.

### 3. Mutation hooks
`apps/frontend/src/api/hooks/useHives.ts`

- `useSplitHive` → `POST /hives/:id/split` (with `apiaryHeaderConfig` for the
  cross-apiary `x-apiary-id` header). Invalidates the hive detail + all hive
  lists, plus `['actions']` and `['todos']` so the new timeline entry and the
  follow-up reminder appear immediately.
- `useUndoSplit` → `DELETE /hives/:hiveId/splits/:splitId` (optional
  `?force=true`). Invalidates lists / actions / todos.

### 4. Timeline rendering
Already landed in Phase 1: `actions-card.tsx` has a `SPLIT` entry (Split icon,
teal) and a `SplitDetails` renderer, so the paired action shows on both hives'
timelines with no extra Phase 3 work.

## Verification

- Frontend `tsc -b` (typecheck) — clean. ✅
- ESLint on the changed/new files — clean. ✅
- **Playwright component test** (`split-wizard.spec.tsx`) — **2 tests pass**:
  1. *walks through the wizard and summarises the choices* — steps through all
     four screens and asserts the summary (`3 brood frames`, `7 frames`, queen
     *stays with the mother*, reminder *in 24 days*, **Split colony** button).
  2. *increasing the frame count updates the preview* — clicks **More frames**
     and asserts the preview flips to `4 brood frames` / `6 frames`.

  Run locally (Chromium as root needs `--no-sandbox`):
  ```bash
  cd apps/frontend
  pnpm test:ct split-wizard   # add --no-sandbox launch args if running as root
  ```
  Screenshots captured under `test-results/split-wizard-step1.png` and
  `…-summary.png`.

## Files
- `apps/frontend/src/pages/hive/hive-detail-page/split/split-wizard.tsx` — the wizard (new).
- `apps/frontend/src/pages/hive/hive-detail-page/split/split-wizard.spec.tsx` — CT test (new).
- `apps/frontend/src/pages/hive/hive-detail-page/action-sidebar.tsx` — entry point.
- `apps/frontend/src/api/hooks/useHives.ts` — `useSplitHive` / `useUndoSplit`.

## Not yet (Phase 4+)
- **Provenance badges** on the hive detail: an *“Ableger von {mother}”* origin
  marker and an *offspring* list, from `Hive.parentHiveId`.
- **i18n**: strings currently use inline English `defaultValue`s only; German
  translations for the wizard land with the provenance polish.
- **Dissolve-into-two** variant (both sides become new hives) — still out of v1
  scope.
