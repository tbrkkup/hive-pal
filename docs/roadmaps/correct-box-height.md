# Roadmap: Correct Box (Zarge) Heights

## Problem

In the "Box Configuration" visualization every box of a given hive system is
rendered at the **same height**, even though real boxes differ a lot in height.
This is most obvious for **Dadant**: a honey super and a brood box are drawn at
identical heights (see the reported screenshot), which looks wrong to any
beekeeper.

### Root cause

Rendered height is derived **only** from the box `variant`
(`getBoxHeight()` in `apps/frontend/src/utils/box-display.ts`). Langstroth and
National each have separate variants for deep / medium / shallow, so their
supers get different heights. **Dadant has a single variant `DADANT`** for every
box, so brood / honey / feeder all collapse to the same `h-28` class.

Secondary issue: the existing height buckets (`h-28`/`h-24`/`h-20` =
112 / 96 / 80 px) are **not proportional** to real box heights (ratios
1 / 0.86 / 0.71 vs. reality 1 / 0.5 / 0.33).

## Researched real box heights (external, mm)

| Box (Zarge)                         | Height (mm) | Ratio to brood |
| ----------------------------------- | ----------- | -------------- |
| Dadant Brutzarge (brood)            | ~300–320    | 1.00           |
| Dadant Honigzarge / Halbzarge       | ~150–172    | ~0.50          |
| Dadant Futterzarge (feeder)         | ~73–100     | ~0.25–0.33     |
| Langstroth deep (9⅝")               | ~240        | 0.80           |
| Langstroth medium (6⅝")             | ~170        | 0.57           |
| Langstroth shallow (5¹¹⁄₁₆")        | ~145        | 0.48           |
| National deep (brood)               | ~225        | 0.75           |
| National shallow (super)            | ~150        | 0.50           |

Sources: bienen-ruck.de, beeventure.de, dehner-imkereibedarf.de (see chat).

## Affected code

- `apps/frontend/src/utils/box-display.ts` — `getBoxHeight()` (single source of
  truth for rendered height; 3 contexts: `detail`, `hive-card`, `minimap`).
- `apps/frontend/src/pages/hive/.../box-configurator/BoxItem.tsx` — applies the
  height class; also renders center label / badge / frame count that must stay
  legible in short boxes.
- `apps/frontend/src/pages/apiaries/components/hives-layout/hive-card.tsx`,
  `apps/frontend/src/components/hive-minimap/hive-minimap.tsx` — other consumers
  of `getBoxHeight()` (incl. the non-standard `h-15` special case).
- No DB / Prisma / Zod change required for the chosen approach (height stays
  derived, not stored).

## Approach

Make box height a function of **(variant, type)** instead of variant alone, and
drive it from a single real-height table (mm), rendering proportionally.

Height resolution:
1. If the variant already encodes physical size (Langstroth/National
   deep/medium/shallow) → use the variant's mm height.
2. Otherwise (e.g. `DADANT`, single variant) → fall back to `type`:
   `BROOD` = full, `HONEY` = half, `FEEDER` = third.

## Phases

### Phase 1 — Core fix (Dadant type-aware height) ✅ fixes the screenshot
- Extend `getBoxHeight()` to accept the box `type` and branch on it for
  single-variant systems (Dadant). Dadant honey → ~half, feeder → ~third.
- Pass `box.type` from `BoxItem.tsx` (and other call sites).
- Minimal, no migration.

### Phase 2 — Proportional real heights (generalization)
- Introduce `BOX_HEIGHTS_MM` map keyed by (variant | type) with the researched
  values, plus a per-context px scale.
- Replace ad-hoc `h-20/h-24/h-28` with proportional heights (inline style or
  Tailwind arbitrary values), consistent across `detail` / `hive-card` /
  `minimap`; remove the `h-15` hack.
- Enforce a sensible minimum height so labels stay legible.

### Phase 3 — UI polish for short boxes
- In `BoxItem.tsx`, adapt content for short boxes (e.g. hide center label,
  keep badge + frame count) so a half/third-height box does not overflow.

### Phase 4 — Verify & ship
- `pnpm typecheck` (frontend), run component tests if present, visual check via
  the app, then commit on branch `correct-box-height`.

## Open decisions (need sign-off)
1. **Scope:** Phase 1 only (quick Dadant fix) vs. Phases 1+2 (full proportional
   model for all systems).
2. **Data model:** keep height derived from type (no migration) vs. store an
   explicit height / split `DADANT` into variants (migration).
