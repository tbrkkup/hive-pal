# Custom treatment products with active-ingredient composition & per-colony ingredient totals

## Summary

Let beekeepers define their **own treatment products** in the UI, each described
by its **physical form** (how it is applied) and its **active-ingredient
composition** (which substances at which concentration). Then, when a treatment
is recorded on a colony, show **how much of each active ingredient**
(oxalic acid, formic acid, thymol, …) a colony has received **over a period —
regardless of which product it came from**.

Concrete example: **VarroMed** contains **formic acid 5 mg/ml** and **oxalic
acid dihydrate 44 mg/ml**. A beekeeper who applies VarroMed *and* a separate
oxalic-acid dribble should be able to see the combined oxalic-acid load on that
colony for the season.

## Motivation / user stories

- *As a beekeeper*, I want to add a product that isn't in the built-in list
  (e.g. VarroMed, a regional product, a home formulation) so I can log my
  treatments accurately.
- *As a beekeeper*, I want each product to record **what it is made of**, so the
  app understands the chemistry, not just a label.
- *As a beekeeper*, I want to see the **total oxalic/formic/… acid applied to a
  colony over time**, aggregated across all products, to respect residue limits,
  avoid over-treating, and keep proper records.

## Current state in the codebase (baseline)

- **Data model** — `Action` (parent) + per-type detail tables. Treatments use
  `TreatmentAction` (`apps/backend/prisma/schema.prisma`): `product String`
  (free text), `quantity Float?`, `unit String`, `duration String?`. There is
  **no treatment catalog table and no active-ingredient concept** anywhere in
  the DB. `product` is an unconstrained string.
- **Product list** — hardcoded `TREATMENT_PRODUCTS` (12 entries: OXALIC_ACID,
  FORMIC_ACID, THYMOL, APIVAR, APISTAN, CHECKMITE_PLUS, HOPGUARD, API_BIOXAL,
  APIGUARD, MAQS, FUMIGATION, OTHER) in
  `packages/shared-schemas/src/actions/details.schema.ts`, each `{ label,
  defaultUnit, requiresQuantity }`. Units are `['ml','g','pcs']`.
- **Treatment form** —
  `apps/frontend/src/pages/inspection/components/inspection-form/actions/treatment.tsx`:
  a `Select` over `TREATMENT_PRODUCTS`, with a **free-text input only when
  `OTHER` is chosen**; unit select; amount input.
- **Custom-entity precedent** — `EquipmentItem` (`schema.prisma`): per-user
  (`userId`-scoped, `@@unique([userId, itemId])`, `isCustom` flag), defaults
  seeded via a SQL migration + PL/pgSQL trigger, managed under the users module
  with an `equipment-settings` page. This is the closest pattern to imitate for
  "my treatment products". (A second pattern, `FrameSize`, is a *shared* catalog
  with admin approval — heavier.)
- **Reporting precedent** — `apps/backend/src/reports/reports.service.ts`
  aggregates *"sugar fed"* by fetching `FEEDING` actions and normalizing via a
  concentration table (`SYRUP_CONCENTRATIONS`) into grams per hive, in memory.
  "Total active ingredient per hive over a period" is the direct analogue for
  `TREATMENT` actions.

## Research: how other software handles this

No reviewed tool models treatments at the **active-ingredient level**, lets
users define a **custom product with its composition**, or aggregates **total
active ingredient per colony over time**. This is the differentiating value here.

| Tool | Custom products | Ingredient composition | Cumulative ingredient totals | Application form |
|---|---|---|---|---|
| **BEEP** (open source) | Partial — configurable inspection categories; treatment = category + amount + unit | ❌ | ❌ | ❌ |
| **VarroaVault** (commercial) | ❌ (documented) | ❌ | ❌ | ❌ — but records product, EPA reg. no., dose, dates, PHI, pre/post mite counts |
| **HiveTracks / BeeKeepPal / HiveBook** | ❌ | ❌ | ❌ | ❌ — basic log + calendar reminders |
| **Homestead/Tamakoa** | ❌ | ❌ | ❌ | Application method as free text |

**Domain facts**

- Common varroa active ingredients: **oxalic acid, formic acid, lactic acid**
  (organic acids); **thymol/menthol** (essential oils); **amitraz,
  tau-fluvalinate, coumaphos, flumethrin** (synthetic acaricides); lithium
  chloride (experimental). The model should not be varroa-only (feed
  supplements, other medications exist).
- **Physical form vs. application method** — the user's "state of matter"
  (liquid/powder/gas) is a good start, but two common forms don't fit the
  three-state model: **gel** (e.g. Apiguard/thymol) and **strip** (e.g.
  Apivar/amitraz). Proposed **physical-form** set: `liquid`, `powder`, `gel`,
  `strip`, `gaseous`. Application method (trickle, spray, sublimate, evaporate,
  insert) is a related but *separate* axis — the same liquid can be trickled or
  sprayed — so it is best modeled as an optional secondary field.
- **Concentration basis** — expressed **per volume** (mg/ml, g/l) for liquids,
  **per mass / percent** (% w/w, mg/g) for solids/gels, and **per unit** (mg per
  strip) for strips. To compute total ingredient mass we need: `amount applied ×
  concentration → normalized mass (g)`, so the applied-amount unit must be
  compatible with the concentration basis. This normalization is the main
  correctness challenge (see open questions).
- **VarroMed** (reference seed): liquid, trickled; formic acid **5 mg/ml** +
  oxalic acid dihydrate **44 mg/ml**.

(Full notes and sources in `research-notes` — competitive links, EMA VarroMed
product information, application-method references.)

## Proposed approach (high level — details to be settled in the roadmap)

**New concepts**
1. **Active ingredient** — a canonical, shared identity (so totals can be summed
   across products). Seeded, extensible list (oxalic acid, formic acid, thymol,
   amitraz, …). *Not* free text, or cross-product aggregation breaks.
2. **Treatment product** — a catalog entry with `name`, `physicalForm`, optional
   default `applicationMethod`/`unit`, and a **composition**: a list of
   `{ activeIngredient, concentration, concentrationUnit }`. Built-in defaults
   (the current 12, given compositions where known) + **per-user custom products**
   (EquipmentItem pattern).
3. **Treatment action → product link** — record which catalog product was used
   (plus amount + unit as today), so ingredient mass can be derived.

**UI**
- A **"Treatment products" management page** (like equipment settings): list
  built-ins + custom, add/edit/delete custom products, edit composition rows.
- The **treatment form** selects a product from the catalog (custom included)
  instead of the hardcoded list; "OTHER free text" is replaced by "add a
  product".
- A **per-colony ingredient view**: on the hive detail / reports, show
  **total mg/g of each active ingredient over a selectable period**, aggregated
  across products.

## Key design decisions / open questions (need your input)

1. **Ownership model:** per-user custom products (EquipmentItem pattern, private
   to the user) — or a shared community catalog with admin approval (FrameSize
   pattern)? *Recommendation: per-user custom + seeded built-ins.*
2. **Physical-form set:** confirm `liquid / powder / gel / strip / gaseous`
   (your liquid/powder/gas + gel + strip). Also add a separate optional
   **application method** field, or fold it into form?
3. **Active-ingredient list:** seeded reference table vs. fixed enum. Reference
   table is extensible (users could add an ingredient); enum is simpler but
   rigid. *Recommendation: seeded reference table, admin-extensible.*
4. **Concentration & totals normalization:** how far do we go for MVP?
   - (a) Only support ingredient totals when units are compatible (e.g. mg/ml ×
     ml → mg), and simply *omit* incompatible combos from the total; or
   - (b) full unit system (volume/mass/percent/per-unit) with density handling.
   *Recommendation: start with (a) — mg/ml·ml and %·g — and flag the rest.*
5. **Migration of existing data:** existing `TreatmentAction.product` free
   strings — map the known 12 to seeded products; leave unknown strings as
   "uncatalogued" (still shown, just no composition)?
6. **Where do ingredient totals surface:** hive detail page, reports page, or
   both? Any residue-limit warnings, or totals only for now?

## Scope

**In scope (MVP candidate):** product catalog (built-in + per-user custom) with
composition; treatment form wired to the catalog; per-colony active-ingredient
totals over a period.

**Likely later / non-goals for MVP:** residue-limit/withdrawal-period warnings;
full density-based unit conversion; regulatory (EPA/EMA) registration numbers;
sharing custom products between users; treatment efficacy (pre/post mite counts).

## Acceptance criteria (draft)

- A user can create, edit and delete a **custom treatment product** in the UI,
  setting its physical form and one or more active ingredients with
  concentrations.
- Built-in products (incl. **VarroMed** as the worked example) exist with correct
  compositions.
- Recording a treatment lets the user pick any catalog product (custom included).
- A colony view shows the **total amount of each active ingredient applied over a
  chosen period**, summed across different products.
- Backend validates composition; existing treatment records keep working.
- Covered by Playwright tests; no regression in the current treatment flow.
