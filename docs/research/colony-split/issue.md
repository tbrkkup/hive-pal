# Feature request: first-class colony split (making an Ableger / nuc)

## Summary

HivePal has no way to record a **colony split** — the act of taking frames out of
one colony to establish a new one. This is one of the most common hands-on
operations in a beekeeping season, and today it can only be approximated by
manually creating a second hive and hand-editing frame counts, which loses the
link between the two colonies and the record that the event ever happened.

This issue proposes a **first-class, atomic split**: one action that creates the
new colony, debits the mother's frames, handles the queen, and records the event
on both hives' timelines — with an optional provenance link from daughter to
mother.

## Why this matters

Splitting is a **core, recurring beekeeping operation** — one of the handful of
things every beekeeper does to manage their colonies — and a hive-management app
that can't record it has a real gap in its timeline. Whenever a split happens,
the data that matters for months afterward (which colony came from which, how
many frames each has, where the queen went, and when to check the queenless side)
is exactly what's lost today.

The same operation serves different purposes at different points in the year,
which is part of why first-class support is worthwhile rather than a niche
add-on:

- **Swarm control** — splitting a colony that's preparing to swarm keeps the bees
  and the increase instead of losing a swarm.
- **Colony increase / replacing losses** — forming new colonies (Ableger / nucs)
  from strong ones.
- **Queen rearing** — the queenless side of a split raises or accepts a new queen.
- **Varroa management** — a split creates a brood break on both sides, used in
  treatment-timing strategies (e.g. split‑and‑treat / "Teilen und Behandeln").

## Current gap

To record a split today, a user must:

1. Manually create a new hive.
2. Manually edit frame counts on the mother.
3. Manually move or re-create the queen.
4. Write a free-text note (on one hive only) to remember it happened.

Problems with this:

- **No atomic record** — the "event" doesn't exist; there's nothing on either
  timeline that says *"a split happened on this date."*
- **No link** between mother and daughter — you can't later ask *"where did this
  colony come from?"* or *"what did I split off this colony this year?"*
- **No frame accounting** — the debit on the mother and the credit on the daughter
  are unrelated manual edits that can silently drift.
- **No follow-up** — the queenless side needs a re-queening check in ~3 weeks, and
  nothing reminds you.

## Proposed solution

A dedicated split operation:

- **`POST /hives/:id/split`** — a single transaction that:
  - creates the daughter hive with a brood box seeded from the moved frames,
  - debits the mother's brood frames,
  - records **queen disposition** (queen stays with the mother, or moves to the
    daughter),
  - writes a **paired `SPLIT` action** on both hives' timelines (shared split id),
  - creates a **follow-up reminder** (Todo) on the queenless side (configurable,
    default ~24 days),
  - optionally links daughter → mother via `Hive.parentHiveId` (**provenance**, not
    biological lineage — clearable later).
- **`DELETE /hives/:id/splits/:splitId`** — a guarded **undo** that reverses the
  whole thing (blocked once the daughter has its own records, unless forced).
- A frontend **split wizard** (frames → new hive → queen → confirm) reachable from
  the hive detail page, plus **provenance badges** ("split from X" / "offspring")
  on the hive header.

### Scope for a first version

- **Mother + one daughter** per split (the common "make an Ableger" case).
- **Brood frames only** (matches Dadant practice, where only brood frames are
  moved into a nuc).
- Not in v1: dissolving one colony into two brand-new hives; moving honey-super
  frames; per-frame identity tracking.

## Prior art

Across existing tools, a split is typically recorded as a generic note or as a new
hive with a "how it was established" attribute — **without** frame accounting,
parent linkage, or a queen-disposition record. A first-class atomic split that
debits the mother *and* creates the daughter as one linked event appears to be a
genuine gap this feature would fill.

## Notes

- Fully backward compatible: adds a new `SPLIT` action type, a nullable
  `Hive.parentHiveId`, and a `SplitAction` detail table; existing data is
  untouched.
- German UI localization is included.
