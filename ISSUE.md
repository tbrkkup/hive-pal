# Feature: record moving a colony to another apiary as a tracked event

## Summary

Moving a colony to a different apiary is one of the few things that happens to a hive and leaves **no trace at all** — no record that it happened, when it happened, or where the colony came from. Where a colony stood, and since when, is part of its history: it explains what it foraged, it matters for disease and quarantine traceability, and in most of Europe the location of colonies is something authorities regulate (see below).

## Terminology used here

An **apiary is a location** — a site where bees stand. Migratory beekeeping (*Wanderung*, transhumance) is therefore not "an apiary that moves" but *colonies moving from one apiary to another*: create "Rapeseed field, May", move 12 hives there, move them back afterwards. This issue is about recording that movement.

## Current behaviour

The only way to move a colony is the apiary select in the hive edit form (`hive-form.tsx`). `HiveService.update()` verifies the hive belongs to the *current* apiary and then spreads the DTO into `prisma.hive.update()`, so `apiaryId` is simply overwritten. `ActionType` has no movement or location event, there is no history table for hive location, and no event listener creates an action for it.

## Why this stands out

The codebase already treats comparable changes as first-class history — location is the exception:

| Change | Recorded? |
|---|---|
| Boxes/frames changed | ✅ auto-creates a `BOX_CONFIGURATION` action (`hive.service.ts`) |
| Queen moved between hives | ✅ dedicated `QueenMovement` model (`fromHiveId`, `toHiveId`, `movedAt`, `reason`) |
| **Colony moved to another apiary** | ❌ **nothing** |

A queen's movements are traceable; the colony's are not.

## Consequences

1. **The move is invisible.** The hive timeline shows inspections and treatments from before and after with no indication that the location changed in between.
2. **Past data is silently re-attributed.** Apiary statistics resolve their hives through the *current* `Hive.apiaryId` and then aggregate that hive's inspections and actions. Moving one colony therefore moves its **entire history** into the new apiary's numbers, including the part produced at the old site.
3. **Layout positions leak between sites.** `positionRow`/`positionCol` describe a slot in an apiary's layout grid and are not cleared on a move, so a moved hive keeps coordinates belonging to a different site's grid.

## Regulatory context

Not a feature requirement, but it explains why beekeepers keep this record. Rules differ per country; these are the ones I could verify:

- **Germany** — Moving colonies into another authority's district requires a health certificate (*Gesundheitszeugnis*) confirming freedom from American foulbrood; it may not be older than nine months and must be presented to the authority at the destination ([BienSeuchV](https://www.gesetze-im-internet.de/bienseuchv/BJNR005940972.html), [LAVES guidance](https://www.laves.niedersachsen.de/download/43134/Verbringen_von_Voelkern_Wanderung_.pdf)).
- **Italy** — The strongest case: the national bee registry (*Anagrafe Apistica*, BDN) requires an annual census of apiaries **with address and geographic coordinates**, and every hive movement — explicitly including *nomadismo* — must be registered before or at the start of the move ([FNOVI](https://www.fnovi.it/node/47230), [Apicoltore Moderno](https://www.apicoltoremoderno.it/censimento-annuale-obbligatorio-e-aggiornamenti-anagrafe-apistica/)).
- **France** — An annual declaration of hives **and their locations** is mandatory (1 Sept – 31 Dec), alongside a *registre d'élevage apicole*; transhumance transport is declared to the DDPP of the destination department ([mesdemarches.agriculture.gouv.fr](https://mesdemarches.agriculture.gouv.fr/demarches/particulier/effectuer-une-declaration-55/article/declarer-des-ruches)).
- **Spain** — A *libro de registro de explotación apícola* is mandatory; transhumance outside one's autonomous community must be communicated to the authority at least a week beforehand with a three-month programme of planned transfers, and the approved communication travels with the hives ([RD 209/2002](https://www.boe.es/buscar/act.php?id=BOE-A-2002-5016)).
- **United Kingdom** — By contrast, registering apiary locations on [BeeBase](https://www.nationalbeeunit.com/) is explicitly **voluntary** and not a legal requirement, though it is strongly encouraged so inspectors can warn nearby beekeepers about outbreaks. Records of veterinary medicines are separately required.

## Related hardening

While tracing the move path: `updateHiveSchema` accepts `apiaryId`, and `HiveService.update()` only checks that the hive currently sits in the apiary from the request context (`x-apiary-id`, validated by `ApiaryContextGuard`). The **destination** apiary arriving in the request body is never checked against the user, so a colony can be written into an apiary the caller does not own. Whichever shape the move feature takes, it should validate the destination — and close this on the existing edit path too.

## Proposed behaviour

- Moving a colony becomes an explicit, dated action with an optional reason, freely datable — back-dated to when it actually happened, or forward-dated to plan a move.
- The move appears on the hive timeline like any other event, showing origin and destination.
- Several colonies can be moved at once, since migratory beekeeping moves whole groups.
- The apiary select in the edit form keeps working but produces the same record, so no move happens silently.

## Scope / non-goals

- **In scope:** movement between existing apiaries, dating, timeline rendering, destination validation, clearing stale layout positions, and attributing apiary statistics to the site where the data was actually produced.
- **Out of scope:** editing an apiary's own coordinates (it is a fixed location by definition), GPS capture, and route planning.
