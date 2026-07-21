# How a colony split (Volksteilung) is documented on a hive card (Stockkarte)

> Research note for a possible HivePal "colony split" feature.
> Question 1: How do beekeepers normally document a Volksteilung on a Stockkarte?

## What a Stockkarte is
A *Stockkarte* is a per-colony record card. Beekeepers log **chronological
entries** for one colony over the season: date, activity/vitality, number of
**brood** and **honey/food frames**, queen sightings and **queen cells**
(swarm/supersedure), temperament, treatments, feeding, weight, migration, and a
subjective assessment. It is the canonical unit of record-keeping for a colony
and the basis for comparing colonies and years.
(Sources: beeventure.de, imkado.de, bees-online.at, LWG Bayern.)

## The domain event: Volksteilung / Ableger
A split takes **frames out of a mother colony's brood box** and puts them into a
**new brood box on a new bottom board**, creating a new colony. Two common
mental models:

1. **Mother + daughter** (most common): the mother colony continues with reduced
   strength; a new **Ableger** (daughter) is created.
2. **Dissolution into two** (e.g. a *Flugling/Brutling* or total split): the old
   colony is conceptually dissolved and **two new colonies** arise.

Practical variants beekeepers name: **Ableger** (nuc), **Sammelbrutableger**
(brood collected from several colonies), **Flugling/Brutling** split (flyers vs.
nurse bees + brood), **Zwischenableger**, **Kunstschwarm** (shook swarm — bees
without brood). The mother colony should be strong enough (≈8–10 occupied frame
spaces) to tolerate the loss. (Sources: bienenquelle.de, bienenundnatur.de,
apiara.app.)

## How it is recorded — two cards, one lineage
Documenting a split touches **two colonies**, so it produces entries on **two
Stockkarten** plus a lineage link between them:

**On the mother colony's card:**
- Date of the split.
- Action: "Ableger gebildet / Volk geteilt".
- **How many and which frames** were removed (e.g. 3 brood + 1 food frame).
- **Queen disposition**: did the old queen **stay** in the mother, or **go** with
  the daughter? (Determines which side is queenless.)
- Resulting **reduced strength** (frame count after removal).
- **Reason** (swarm prevention / making increase / Varroa brood break).

**On the new (daughter) colony's card — a newly created card:**
- **Origin / Herkunft**: which mother colony it came from, and the date.
- **What it received**: number/type of frames (brood, food), approx. bees.
- **Queen status**: queenless → will **raise its own queen** (Nachschaffung), was
  given a **queen cell** (Weiselzelle), or an **introduced mated queen**
  (zugesetzte Königin). Plus expected timeline (emergence / mating).
- **Feeding** and any treatment (a brood break is often used for Varroa).

**Lineage:** the daughter card references the mother (Abstammung/Herkunft). Good
practice is a bidirectional trace — the mother's entry says "→ Ableger X", the
daughter's header says "aus Volk Y".

## Fields that a digital split record should capture
Distilled from the above, a faithful digital model of a split needs:

| Field | Notes |
|-------|-------|
| Date | When the split was performed |
| Source (mother) colony | The hive frames were taken from |
| New (daughter) colony | Created as part of the operation |
| Frames moved | Count and ideally type (brood / food / empty) |
| Queen disposition | Which side keeps the old queen; how the queenless side is requeened |
| Method / type | Ableger, Sammelbrutableger, Flugling/Brutling, Kunstschwarm … |
| Reason | Swarm prevention / increase / Varroa break |
| Resulting strengths | Mother after removal; daughter starting strength |
| Notes | Free text |

## Key takeaways for HivePal
- A split is inherently a **two-hive, timestamped event with a parent→child
  lineage** — not a single-hive edit.
- The **frame transfer** (debit the mother, credit the daughter) and the **queen
  disposition** are the two facts beekeepers most want recorded.
- It should appear on **both hives' timelines** and create a **new hive** whose
  origin is traceable to the mother.

## Split methods (glossary)
The German methods a split UI might offer as presets, and how they differ:

- **Ableger** (nuc / basic split): the umbrella term. Take **brood frames + bees**
  (usually + one food frame) from a strong colony into a new box. Typically starts
  **queenless** and is requeened (raises own / given a queen cell / introduced
  mated queen). Frames come from the **brood box**.
- **Sammelbrutableger** (collected-brood split): combine brood frames from
  **several** donor colonies into **one** strong new colony. Doubles as a **Varroa
  measure** (removes capped brood from the donors) and a good base for queen
  rearing. (Multi-donor → a v2 concern; v1 is single-mother.)
- **Flugling / Brutling** (flyer/brood split by bee age, using location):
  - **Flugling** = the box left at the **old location** collects the **flying
    bees** (they return home); usually keeps the **queen**; little/no brood.
  - **Brutling** = the box moved to a **new location** keeps the **brood + young
    nurse bees**; becomes **queenless** → raises a queen.
  Also a Varroa method (brood break on the flyer side).
- **Kunstschwarm** (artificial/shook swarm, ≈ a "package"): shake **bees only** —
  **no frames, no brood** — into a new box with a queen. Used for queen breeding,
  Varroa-clean starts (no brood to treat around), or making up packages.
- **Pagden split** (a.k.a. *Pagden artificial swarm*): a **swarm-control** variant
  of the Flugling/Brutling idea. The original hive is moved aside; a new box goes
  on the **old stand** with the **queen** + a frame — the **flying bees return to
  the old stand** and join her (this box "is the swarm", brood-free → swarm urge
  satisfied). The moved-aside original keeps the **brood + queen cells** and raises
  a new queen. (This is the method behind the app's existing "Pagden split"
  placeholder guide.)

Note for the model: **Ableger** and **Flugling/Brutling** are the common
single-mother cases v1 targets; **Kunstschwarm** moves *no* frames (a special case
where `framesMoved = 0`); **Sammelbrutableger** is multi-donor (later).

## Sources
- [beeventure.de – Stockkarte](http://www.beeventure.de/imkerei/werkzeug/stockkarte)
- [imkado.de – Wie verwende ich eine Stockkarte?](https://imkado.de/pages/erklarung-pocket-stockkarte)
- [bees-online.at – Stockkarten 2021](https://bees-online.at/2021/01/15/stockkarten-fuer-das-jahr-2021/)
- [LWG Bayern – Bienenhaltung Basisteil (PDF)](https://www.lwg.bayern.de/mam/cms06/bienen/dateien/bienenhaltung-basisteil.pdf)
- [bienenquelle.de – Teilung/Ablegerbildung](https://bienenquelle.de/teilung-bienenstock-ablegerbildung/)
- [bienenundnatur.de – Ableger bilden](https://www.bienenundnatur.de/imkerpraxis/vermehrung/ableger-bilden-junge-voelker-fuer-die-zukunft-523)
- [apiara.app – Ableger bilden Anleitung](https://www.apiara.app/de/ratgeber/ableger-bilden-anleitung)
