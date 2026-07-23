# Research: how other software handles treatments / medications

## Competitive analysis

| Tool | Custom products? | Active-ingredient composition? | Cumulative ingredient totals per colony? | Application method/form? | Notes |
|---|---|---|---|---|---|
| **BEEP** (open source, beep.nl; Laravel API + Vue app) | Partially — customizable **inspection lists / category taxonomy**; treatments logged as a category item, optionally with an **amount + unit** | ❌ No ingredient breakdown | ❌ No | ❌ Not modeled as a first-class property | Configurable hierarchical categories; treatment = category + amount + unit. No chemistry. |
| **VarroaVault** (commercial) | ❌ Not documented | ❌ No | ❌ No | ❌ No | Most comprehensive treatment log: product name, **EPA reg. number**, dose, start/end dates, PHI end date, pre/post mite counts for efficacy. Compliance-focused, not chemistry. |
| **HiveTracks / BeeKeepPal / HiveBook** | ❌ | ❌ | ❌ | ❌ | Basic treatment logging + calendar reminders; product name + dose as free-ish text. |
| **Homestead / Tamakoa** | ❌ | ❌ | ❌ | Records **application method** (free text) | Product name, dosage, method, effectiveness. |

**Key gap (our differentiator):** none of the reviewed tools model treatments at the **active-ingredient level**, none let users define a **custom product with its composition**, and none aggregate **total active ingredient applied per colony over time** (e.g. "how many grams of oxalic acid did this colony receive this season, across VarroMed + a separate OA dribble?"). This is the novel value of the proposed feature.

## Domain facts

### Active ingredients commonly used against Varroa (organic + synthetic)
- **Organic acids:** oxalic acid (dihydrate), formic acid, lactic acid
- **Essential oils / terpenes:** thymol, menthol, eucalyptus/camphor
- **Synthetic acaricides:** amitraz, tau-fluvalinate, coumaphos, flumethrin
- **Other/experimental:** lithium chloride
- (Non-varroa "treatments" also exist: e.g. terramycin/oxytetracycline historically, feed supplements — the model should not be varroa-only.)

### Physical form & application method (the user's "Zustand" axis, refined)
The physical **form** and the **application method** are related but distinct — worth capturing both:

| Physical form | Typical application method | Example products |
|---|---|---|
| **Liquid** | Trickling/dribble (Träufeln), Spraying (Sprühen) | VarroMed, oxalic acid dribble, lactic acid |
| **Powder / crystals** | Sublimation/Vaporization (Verdampfen) — solid → gas via heat | Oxalic acid crystals |
| **Gaseous / evaporating** | Evaporation (Verdunstung) via evaporator pads | Formic acid (e.g. MAQS, Nassenheider) |
| **Strip / contact** | Insert strip(s) into brood chamber | Apivar (amitraz), Apistan (fluvalinate), Bayvarol |
| **Gel** | Placed on top bars, slow release | Apiguard (thymol) |

**Recommendation:** offer a **physical form** enum (liquid / powder / gel / strip / gaseous) — the user's original liquid/powder/gas plus **gel** and **strip**, which are common and don't fit the three-state model. Application method can be a secondary optional enum (trickle / spray / sublimate / evaporate / insert / other), since the same form (liquid) supports multiple methods (trickle vs. spray).

### Reference product — VarroMed
- Marketed as **"5 mg/ml + 44 mg/ml"**
- **Formic acid: 5 mg/ml**
- **Oxalic acid dihydrate: 44 mg/ml**
- Liquid; applied by trickling (dribble).
- Good canonical seed example for "one product → two active ingredients at defined concentrations".

### Units / concentration modelling notes
- Concentration is expressed **per volume** (mg/ml, g/l) for liquids and **per mass** (% w/w, mg/g) for solids/gels/strips. The model needs a concentration value + a concentration unit, or a normalized "amount of active ingredient per unit of product".
- To compute "total oxalic acid applied", we need: (quantity of product applied) × (concentration of ingredient) → normalized mass. So the amount-applied unit (ml / g / strips) must be compatible with the concentration basis. Strips are awkward (per-strip mg) — allow "mg per unit".

## Sources
- BEEP — open-source bee monitoring: https://github.com/beepnl/BEEP · https://github.com/beepnl
- VarroaVault app comparison (varroa focus): https://varroavault.com/best-beekeeping-app-varroa · https://varroavault.com/beekeeping-app-comparison-2026
- Homestead / Tamakoa beekeeping management: https://tamakoa.com/homestead-tracker/beekeeping-management/
- VarroMed composition (EMA product information): https://www.ema.europa.eu/en/documents/product-information/varromed-epar-product-information_en.pdf
- VarroMed 5 mg/ml + 44 mg/ml (retail spec): https://www.beeequipment.eu/varromed-5-mg-ml-44-mg-ml-555-ml
- Oxalic acid application methods (trickle/sublimation/spray): https://beekeepclub.com/varroa-mite-treatment-with-oxalic-acid/ · https://www.apisave.com/blog-posts/varroa-mite-treatment
