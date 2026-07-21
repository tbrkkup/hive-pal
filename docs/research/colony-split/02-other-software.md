# How other beekeeping software documents colony splits

> Research note for a possible HivePal "colony split" feature.
> Question 2: How is a split documented in other software — especially the
> open-source **BEEP** (github.com/beepnl/BEEP), plus popular closed-source apps.

## BEEP (open source) — github.com/beepnl/BEEP
**Stack:** Laravel (PHP) API + Vue.js frontend, MySQL/MariaDB + InfluxDB (sensor
time-series). It pairs manual inspections with automatic hive-sensor data.

**Core entities:** Apiaries (locations) · Hives · **Inspections** (a *dynamic,
user-customizable checklist* model) · Queens · Devices/Measurements.

**How splits are handled:** BEEP has **no dedicated split entity or parent→child
lineage**. A split is recorded the same way any change is: as an **inspection /
event entry** on the hive's timeline (BEEP's docs note that "hive actions
(changes in hive configuration) are saved as inspections"). The queen is managed
in a separate **queen module** (name, race, birth date, status). There is no
documented modeling of **frames moved** during a split, nor an automatic link
from a new hive back to the donor hive.

**Takeaway:** BEEP models the split as *"an event/inspection on one hive"* plus a
manually-created second hive. It is a good precedent for **"record the split on
the timeline"**, but it does **not** solve lineage or frame accounting — which is
exactly where HivePal can do better.

Docs: [BEEP repo](https://github.com/beepnl/BEEP) · [BEEP API docs](https://api.beep.nl/docs/) · [BEEP app manual](https://beep.nl/beep-app)

## b.tree (closed source) — btree.at
Cloud beekeeping software covering apiaries, colonies, inspections, treatments,
feedings, harvests, tasks, **queens and queen-rearing workflows**.

- **Establishment type**: the hive-creation form has a **"Type"** field with
  values like *nuc, swarm, breeding unit* — so a colony's *origin* is captured as
  an attribute of the new hive.
- **Queen assignment**: a new colony's queen is a queen record linked to the hive
  with an **introduction date** (queen module).
- **Historical status**: colonies can be set to states like *sold, united, lost*
  — outcome tracking rather than lineage.
- **Nuc "collection-point" hives**: b.tree lets a hive entry act as a temporary
  collection point for multiple colonies (nucs).

**Gaps** (per its docs): **no automatic parent-hive lineage**, **no frame-count
recording** specific to a split, **no origin link** from daughter to donor, and
**no split-specific workflow** — splits are done via manual hive creation + queen
assignment.

Docs: [b.tree](https://www.btree.at/) · [b.tree – First Steps](https://www.btree.at/doc-first-steps/)

## General pattern across apps (Hive Tracks, Apiary Book, ApiManager, APILOG …)
Across mainstream apps the consistent pattern is:
1. **"How established" attribute** on a hive — Nuc, Package, **Split**, Cut-out,
   Swarm capture — recorded when the hive is created.
2. **Queen record** linked to the hive with an installation/introduction date.
3. The split itself captured as a **note / inspection event**, occasionally with a
   free-text "source colony" reference.

What is almost universally **missing**:
- A **first-class, atomic split operation** that in one step creates the daughter
  hive **and** debits the mother's frames.
- **Bidirectional lineage** (mother ⇄ daughter) as structured data.
- **Frame-transfer accounting** (how many brood/food frames moved).
- Explicit **queen disposition** ("old queen stays vs. goes; queenless side is
  requeened by cell / mating / introduction").

## Where HivePal can differentiate
The research shows a clear opportunity: most tools treat a split as *"make a new
hive + write a note."* HivePal already has the building blocks (see
`03-hivepal-api-assessment.md`) to model a split as a **first-class, atomic
two-hive event** with:
- a **parent→child lineage** link,
- **frame-transfer accounting** (reusing the integer `frameCount` + the existing
  `BOX_CONFIGURATION` action mechanism, and the harvest `framesTaken` precedent),
- **queen disposition** (reusing `QueenMovement` — whose transfer dialog *already*
  hints "e.g., Hive split, requeen…"), and
- **timeline entries on both hives** (reusing the `Action` framework).

That would make HivePal's split documentation more complete than BEEP or b.tree.

## Sources
- [BEEP repo](https://github.com/beepnl/BEEP) · [BEEP API docs](https://api.beep.nl/docs/) · [BEEP app v3 helpdesk](https://beepsupport.freshdesk.com/en/support/solutions/articles/60000696834-beep-app-v3)
- [b.tree](https://www.btree.at/) · [b.tree First Steps](https://www.btree.at/doc-first-steps/)
- [beekeepclub – Best beekeeping apps](https://beekeepclub.com/best-beekeeping-apps/)
- [The Bee Supply – Record Keeping (establishment type)](https://thebeesupply.com/blogs/beekeepers-blog/record-keeping)
