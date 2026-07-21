# Phase 4 — provenance UX + German localization (implemented)

Status: **done** on branch `research/colony-split`. Surfaces the split
**provenance** link (mother ↔ offspring) that was written since Phase 1 but never
read back, and finishes the **German localization** of the split feature.

## Provenance: reading back `Hive.parentHiveId`

Phase 1 added `Hive.parentHiveId` (+ self-relation `parentHive` / `offspring`,
relation `"HiveSplit"`, `onDelete: SetNull`) and Phase 2's split writes it. But
nothing exposed it. Phase 4 does:

1. **Shared schema** (`packages/shared-schemas/src/hives/hive.schema.ts`)
   - `hiveProvenanceRefSchema` = `{ id, name, status }` (a lightweight hive ref).
   - `hiveDetailResponseSchema` gains `parentHiveId?`, `parentHive?` (the mother),
     and `offspring` (hives split off from this one, default `[]`).
2. **Backend** (`apps/backend/src/hives/hive.service.ts`, `findOne`)
   - `include` now selects `parentHive { id, name, status }` and
     `offspring { id, name, status }` (ordered by name).
   - The DTO maps `parentHiveId`, `parentHive`, and `offspring`.
   - `onDelete: SetNull` means deleting a mother simply clears the child's
     `parentHiveId` — no cascade, provenance just disappears.

## Provenance badges (frontend)

`apps/frontend/src/pages/hive/hive-detail-page/split/hive-provenance.tsx` —
`HiveProvenance` renders, directly under the hive name on the detail header
(`page.tsx`):

- **Origin**: a teal chip **"Ableger von {mother}"** linking to the mother hive
  (only when `parentHive` is set).
- **Offspring**: a **"Ableger:"** label followed by one linked chip per child
  (archived children are dimmed). Hidden when there are none.
- Renders **nothing** when the hive has neither parent nor offspring, so ordinary
  hives are visually unchanged.

Both directions are plain `react-router` links, so provenance is navigable in
both directions (mother → daughter and back).

## German localization (the split feature)

- The **`SplitWizard`** now routes every string through `useTranslation('hive')`
  with English `defaultValue` fallbacks (converted in the Phase 3 follow-up).
- New keys added to **both** `public/locales/en/hive.json` and
  `…/de/hive.json`: the `hive:split.*` block (wizard + provenance) and
  `hive:actions.splitColony`.
- Dynamic numbers are composed in JS (no i18next interpolation) so the wizard is
  robust with or without an i18n provider — which keeps the Playwright component
  tests (rendered without a provider) green in English.

> **Note — the action timeline** (`inspection/components/actions-card.tsx`) still
> uses a hardcoded English label map for **all** action types (Feeding,
> Treatment, …, "Colony Split"). Translating only the split label there would be
> inconsistent with its siblings, so it's intentionally left for a broader
> timeline-i18n pass (Phase 5).

## Verification

- shared-schemas build + `prisma generate` — clean. ✅
- Backend `tsc --noEmit` (incl. `split.e2e-spec.ts`) — clean. ✅
- Frontend `tsc -b` + ESLint on changed files — clean. ✅
- **Playwright component tests** — `hive-provenance.spec.tsx` (3 tests: origin
  link, offspring links, empty render) **pass**; the Phase 3 `split-wizard`
  tests still **pass** after the i18n conversion.
- **e2e** (`split.e2e-spec.ts`): the first test now also asserts
  `GET /hives/:id` returns `parentHive` on the daughter and lists the daughter in
  the mother's `offspring`. **Not run here** (needs Docker) — run with
  `pnpm test:e2e`.

## Files
- `packages/shared-schemas/src/hives/hive.schema.ts` — provenance schema + fields.
- `apps/backend/src/hives/hive.service.ts` — `findOne` include + DTO mapping.
- `apps/backend/test/split.e2e-spec.ts` — provenance endpoint assertion.
- `apps/frontend/src/pages/hive/hive-detail-page/split/hive-provenance.tsx` (+ `.spec.tsx`).
- `apps/frontend/src/pages/hive/hive-detail-page/page.tsx` — renders the badges.
- `apps/frontend/src/pages/hive/hive-detail-page/split/split-wizard.tsx` — i18n.
- `apps/frontend/public/locales/{en,de}/hive.json` — `split.*` + `actions.splitColony`.

## Not yet (Phase 5)
- Broader timeline i18n (the action-label map) + methods/reasons DE/EN.
- The deferred "dissolve into two new hives" variant.
- Filling the in-app "Pagden split" guide placeholder.
