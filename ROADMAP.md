# Roadmap — Custom treatment products with active-ingredient tracking

Decisions locked from the issue discussion:
1. **Ownership:** per-user custom products + seeded **global** built-ins. The
   data model is designed so a **shared community catalog with admin approval**
   can be added later without a rewrite (see "Forward-compatibility").
2. **Physical form:** `LIQUID · POWDER · GEL · STRIP · GASEOUS`, plus an optional
   separate **application method** (`TRICKLE · SPRAY · SUBLIMATE · EVAPORATE ·
   INSERT · OTHER`).
3. **Active ingredients:** a seeded, extensible reference table (canonical
   identities so totals sum across products).
4. **Units:** a **full unit system** — concentration per volume / mass / percent
   / per-unit, amount in volume / mass / count, with **product density** to
   bridge volume↔mass; everything normalized to a canonical **mass (mg)**.
5. **Where totals surface:** the **hive detail page** and the **reports** page.
6. **In scope (added):** **withdrawal period / residue safety** (a honey
   withdrawal period per product, harvest-window warnings, per-colony withdrawal
   status) and **treatment efficacy** (pre/post mite counts → efficacy %).

---

## Data model

### New tables / enums (Prisma — `apps/backend/prisma/schema.prisma`)

```prisma
enum TreatmentPhysicalForm { LIQUID POWDER GEL STRIP GASEOUS }
enum TreatmentApplicationMethod { TRICKLE SPRAY SUBLIMATE EVAPORATE INSERT OTHER }

model ActiveIngredient {
  id              String  @id @default(uuid())
  key             String  @unique          // canonical, e.g. "OXALIC_ACID"
  name            String                    // "Oxalic acid (dihydrate)"
  isBuiltIn       Boolean @default(true)
  createdByUserId String?                   // set for user-added ingredients
  compositions    TreatmentProductIngredient[]
}

model TreatmentProduct {
  id                String @id @default(uuid())
  userId            String?                  // NULL = global built-in; set = private custom
  user              User?  @relation(fields: [userId], references: [id], onDelete: Cascade)
  name              String
  physicalForm      TreatmentPhysicalForm
  applicationMethod TreatmentApplicationMethod?
  defaultUnit       String?                  // suggested amount unit (ml, g, pcs)
  density           Float?                   // g/ml — needed only when amount unit and concentration basis differ dimensions
  withdrawalPeriodDays Int?                   // honey withdrawal period (Wartezeit); null = unknown
  isBuiltIn         Boolean @default(false)
  // Forward-compat hook for the shared catalog (unused in MVP): status/approval
  ingredients       TreatmentProductIngredient[]
  treatmentActions  TreatmentAction[]
  createdByUserId   String?
  @@index([userId])
  // Uniqueness: partial unique index on (name) WHERE user_id IS NULL for built-ins,
  // and unique (userId, name) for custom — created in migration SQL.
}

model TreatmentProductIngredient {
  id                 String @id @default(uuid())
  productId          String
  product            TreatmentProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  activeIngredientId String
  activeIngredient   ActiveIngredient @relation(fields: [activeIngredientId], references: [id])
  concentration      Float             // e.g. 44
  concentrationUnit  String            // "mg/ml" | "g/l" | "%w/w" | "mg/g" | "mg/piece"
  @@unique([productId, activeIngredientId])
}
```

### Change to existing `TreatmentAction`
Add an optional FK to the catalog; keep the free `product` string for
backward-compatibility and uncatalogued entries.

```prisma
enum MiteCountMethod { NATURAL_DROP SUGAR_ROLL ALCOHOL_WASH CO2 OTHER }

model TreatmentAction {
  // ...existing: product String, quantity Float?, unit String, duration String?
  productId        String?
  treatmentProduct TreatmentProduct? @relation(fields: [productId], references: [id])
  // Efficacy (optional): mite counts around the treatment. Same method before &
  // after → efficacy% = (before - after) / before. Natural drop = mites/day;
  // sugar roll / alcohol wash = mites per sample (sampleSize bees).
  miteCountMethod  MiteCountMethod?
  miteCountBefore  Float?
  miteCountAfter   Float?
  miteSampleSize   Int?     // e.g. 300 bees, for roll/wash
}
```

### Seed data (built-ins, global — `userId = NULL`)
- **Active ingredients:** oxalic acid (dihydrate), formic acid, lactic acid,
  thymol, menthol, amitraz, tau-fluvalinate, coumaphos, flumethrin, lithium
  chloride.
- **Products:** the current 12 (`OXALIC_ACID`, `FORMIC_ACID`, `THYMOL`, `APIVAR`,
  `APISTAN`, `CHECKMITE_PLUS`, `HOPGUARD`, `API_BIOXAL`, `APIGUARD`, `MAQS`,
  `FUMIGATION`, `OTHER`) reborn as catalog rows with forms and compositions where
  known, **plus VarroMed** = liquid, trickle, formic acid **5 mg/ml** + oxalic
  acid dihydrate **44 mg/ml**.
- **Data migration:** map existing `TreatmentAction.product` strings to the
  matching built-in `productId` where the string matches a known key; leave
  unknown strings as-is (uncatalogued, still displayed, no composition).

Seeding follows the established **SQL-migration seeding** precedent
(`prisma/migrations/*_seed_default_equipment`), but built-ins are inserted **once
globally** (not per-user via trigger), since `userId` is NULL.

---

## Unit / normalization engine (decision 4 — full system)

A dimensioned units utility (new, in `packages/shared-schemas` so front + back
share it; extends the ml/l/g conversions already in
`reports.service.ts`/`actions.service.ts`).

- **Dimensions:** volume (ml, l, fl oz, qt, gal), mass (mg, g, kg, oz, lb),
  count (piece/strip), percent.
- **Concentration** = mass ÷ {volume | mass | count}.
- **massApplied(ingredient) = amountApplied × concentration**, with unit
  reconciliation:
  - same denominator dimension as the amount → direct (mg/ml × ml, mg/g × g,
    %w/w × g, mg/piece × piece);
  - amount dimension differs from concentration basis (e.g. concentration mg/ml
    but amount in g) → convert via the product's **`density` (g/ml)**;
  - if the conversion is impossible (no density, incompatible) → the total for
    that ingredient is flagged **incomplete** rather than silently wrong.
- Canonical output unit: **mg** (displayed as mg/g as appropriate).
- **Thoroughly unit-tested** — this is the correctness core.

---

## Residue / withdrawal period & efficacy

**Withdrawal period (Wartezeit) & residue safety**
- `TreatmentProduct.withdrawalPeriodDays` — the honey withdrawal period, seeded
  for built-ins where known (editable by the user for their products).
- A colony is **"in withdrawal until"** `lastTreatmentDate + withdrawalPeriodDays`.
  Shown on the hive detail page (badge + safe-harvest date).
- When a **harvest** is recorded (there is a `HARVEST` action /
  `harvestAction`) on a hive still inside a withdrawal window, show a
  **warning** ("Honey may contain residues — treated with {{product}} until
  {{date}}"). Non-blocking (advisory), overridable.
- Residue awareness overall = withdrawal enforcement **plus** the cumulative
  active-ingredient totals feature (the ingredient view *is* the residue-exposure
  record per colony).

**Efficacy (Wirksamkeit)**
- Optional mite counts before/after a treatment (fields above). When both are
  present with the same method, compute **efficacy % = (before − after)/before**.
- Displayed on the treatment entry and summarized on the hive detail page (and,
  where useful, as a trend in reports).
- **One small open choice:** record counts **on the treatment** (simplest,
  chosen here — matches VarroaVault's pre/post model) vs. a **standalone
  mite-monitoring model** (independent counts, efficacy derived by pairing).
  *Recommendation: on-the-treatment for this iteration; standalone monitoring can
  be added later and is additive.*

---

## Phased plan

**Phase 1 — Schema, migration, seed** *(backend/prisma, shared-schemas)*
- Prisma models/enums above; migration incl. partial unique indexes and the
  `TreatmentAction.productId` FK.
- Seed built-in ingredients + products (incl. VarroMed) with forms,
  compositions and **withdrawal periods** where known; data-migrate existing
  `product` strings → `productId`.
- Zod schemas in `shared-schemas`: `activeIngredientSchema`,
  `treatmentProductSchema`, composition schema, `physicalForm` /
  `applicationMethod` / `concentrationUnit` enums.
- Deliverable: DB + shared types ready; existing treatment flow untouched.

**Phase 2 — Units engine** *(shared-schemas)*
- Dimensioned conversion + concentration→mass normalization with density.
- Unit tests covering every basis and the density bridge and the
  incomplete-total case.

**Phase 3 — Backend API**
- New `treatment-products` module: `GET` (built-ins + my custom), `POST`, `PUT`,
  `DELETE` (custom only; built-ins read-only), scoped by `req.user.id`.
- `active-ingredients`: `GET` (list); create limited to admin/extensible (thin).
- Actions service: accept/return `productId` and the optional **mite-count /
  efficacy** fields on treatment create/update; compute efficacy % server-side.
- Reports service: `calculateActiveIngredientsByHive(hiveIds, start, end)`
  mirroring `calculateFeedingByHive` — fetch `TREATMENT` actions +
  `treatmentAction` + product composition, normalize via the units engine,
  aggregate `Map<hiveId, Map<ingredientKey, mg>>`; expose in the statistics DTO
  and a per-hive endpoint for the detail page.
- **Withdrawal status:** derive a hive's active withdrawal window (last
  treatment + `withdrawalPeriodDays`) and flag harvests recorded within it.
- Backend e2e (testcontainers) for CRUD + aggregation + withdrawal + efficacy.

**Phase 4 — Frontend: product management UI**
- New "Treatment products" settings page (modeled on
  `equipment-settings-page.tsx` + `equipment-table.tsx`): list built-ins + custom,
  add/edit/delete custom, composition editor (ingredient picker + concentration +
  unit rows), physical form, application method, optional density.

**Phase 5 — Frontend: wire the treatment form**
- `inspection-form/actions/treatment.tsx` (+ hive add/edit-action dialogs):
  product select fed from the catalog API (custom included); replace the
  `OTHER` free-text branch with a "＋ New product" affordance; keep amount + unit;
  send `productId`.
- Optional **mite-count fields** (method, before/after, sample size) for
  efficacy — collapsed/secondary so the quick flow stays fast.
- Retire the hardcoded `TREATMENT_PRODUCTS` const (or keep as fallback labels).

**Phase 6 — Frontend: ingredient totals, withdrawal & efficacy**
- **Hive detail page:** an "Applied active ingredients" section with a period
  selector → table of ingredient → total (mg/g), incomplete-total indicator;
  a **withdrawal badge** ("in withdrawal until {{date}}" / "safe to harvest");
  **efficacy** shown on treatment entries.
- **Reports page:** a treatment/ingredient-totals block alongside feeding totals
  (by hive, over the selected period); optional efficacy summary.
- **Harvest flow:** advisory warning when harvesting a hive still in a withdrawal
  window.

**Phase 7 — i18n, tests, screenshots, polish**
- en + de strings (matching the touched files' register).
- **Playwright**: component test for the management page & composition editor;
  a UI test driving the flow (create custom product → log treatment → see totals)
  that also **captures the screenshots** for the PR.
- Manual verification via the `verify`/`run` flow.

**Phase 8 — PR** (you submit) with description + UI screenshots.

---

## Forward-compatibility: shared catalog later (as requested)

The MVP already lays the groundwork so a shared, admin-approved catalog is an
*additive* change, not a rewrite:
- `TreatmentProduct.userId` is **nullable** — global built-ins already use
  `NULL`. A future "community product" is just a global row that started as a
  user submission.
- Reserve a `status` (`PENDING/APPROVED/REJECTED`) + `createdByUserId` on
  `TreatmentProduct` (mirroring `FrameSize`); MVP treats all built-ins as
  approved. Adding admin approve/reject endpoints + an admin review page later
  reuses the existing `frame-sizes` admin pattern.
- `ActiveIngredient` is likewise global and extensible.

## Still-open (small) — confirm or defer to implementation

- **Concentration-unit set** — `mg/ml, g/l, %w/w, mg/g, mg/piece` — **confirmed**.
- **Density UX** — only ask for density when a product's amount unit and
  concentration basis differ dimensions (so most products never need it). OK?
- **Efficacy modelling** — mite counts **on the treatment** (chosen) vs. a
  standalone monitoring model (future). OK?

## Non-goals (this iteration)
Shared catalog UI (groundwork only); **absolute residue limits / country-specific
MRL enforcement** (we warn via withdrawal periods + show exposure totals, but do
not enforce legal MRLs); EPA/EMA registration-number fields; a standalone
mite-monitoring model; sharing custom products between users.
