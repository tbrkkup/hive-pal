# Roadmap — recording colony relocation between apiaries

Implementation plan for `ISSUE.md`. Developed on `martinhrvn/hive-pal:main` so it can go upstream.

## Branch split

Everything is developed in one place and split for review afterwards:

- **`hive-relocation`** — single-colony relocation, based directly on `main`. This is the first PR.
- **`hive-relocation-bulk`** — moving several colonies at once, based on the merge of `main` and the single-colony branch, so it can be reviewed and merged after it.

## Related work

Relocation is structurally similar to the separately proposed `STATUS_CHANGE` and `SPLIT` action types (standalone, freely dated actions with a detail table). Those PRs are worth cross-referencing for the reviewer, but this implementation is **independent of both** and assumes neither is merged.

## Design

### Where the history lives

A new action type, `RELOCATION`, plus a `RelocationAction` detail table — the shape every other action already uses.

- The hive timeline is where users look for "what happened to this colony", and it renders `Action` rows. A relocation belongs in that stream, chronologically between the inspections and treatments around it.
- `Action.hiveId` is set while `Action.inspectionId` stays null, so a standalone action needs no new mechanism, and `date` is already a plain column — which is what makes free dating work.
- A separate `HiveMovement` table mirroring `QueenMovement` would keep movements out of the timeline and force a second query plus a merge into every view wanting a full history.

```prisma
enum ActionType {
  // …
  RELOCATION
}

enum RelocationReason {
  FORAGE          // Tracht
  OVERWINTERING   // Einwinterung
  OTHER           // described in the action's free-text notes
}

model RelocationAction {
  id             String            @id @default(uuid())
  actionId       String            @unique
  action         Action            @relation(fields: [actionId], references: [id], onDelete: Cascade)

  // Plain columns, not foreign keys — see below.
  fromApiaryId   String?
  toApiaryId     String?

  // Name snapshots, so a move stays readable after an apiary is deleted.
  fromApiaryName String?
  toApiaryName   String?

  reason         RelocationReason?
  // null while the move is still in the future; set once it has taken effect.
  appliedAt      DateTime?

  @@index([fromApiaryId])
  @@index([toApiaryId])
  @@index([appliedAt])
}
```

**Why the apiary references are not foreign keys.** Deleting an apiary cascades to the hives *currently* in it and therefore to their actions — but a colony that has since moved away survives, and its history still names the deleted site. A hard FK would block the delete, cascading would erase a real event from an unrelated colony's log, and `SetNull` collides with the cascade on the very same rows (it made deleting an apiary or a user fail outright). Plain columns sidestep all three: writes are validated in the service, and the snapshotted names keep an entry legible ("moved from Rapeseed field") once the id points at nothing.

### Dating, including future moves

Free dating was requested, and future dates raise a question the other action types never had: a treatment logged for next week is just a record, but a *relocation* logged for next week must not change where the colony is **today**. `Hive.apiaryId` is the authorization axis across the backend (~116 filter sites), so it has to keep meaning "where this colony is now".

Therefore:

- **Date in the past or now** → applied immediately: `Hive.apiaryId` updated, positions cleared, `appliedAt` set.
- **Date in the future** → recorded as a *planned* move. The action appears on the timeline as upcoming, but `Hive.apiaryId` is untouched and `appliedAt` stays null.
- A daily `@Cron` applies planned moves once due. `@nestjs/schedule` is already used in this codebase (`platform-metrics`, `lease-sweeper`, `swarm-alert`), so this adds no new infrastructure.

### Service

One method, `relocate(hiveId, { toApiaryId, date, reason, notes }, filter)`, in a dedicated `HiveRelocationService`, shared by every entry point:

1. **Authorize the colony directly**, by write access to the apiary it currently stands in — not by the request's apiary context. A colony can be opened from outside the selected apiary (any cross-apiary listing does that), and the move has to work there too.
2. **Verify the destination the same way.** Moving a colony writes to both ends, so both require owner or an active `OWNER`/`EDITOR` membership; a `VIEWER` must not move colonies in or out. `ForbiddenException`, not a silent write.
3. Destination equals current apiary → no-op, no action row; re-saving an unchanged form must not litter the timeline.
4. One transaction: create `Action` + `RelocationAction`, and if the move is due, update `Hive.apiaryId` and **clear `positionRow`/`positionCol`** (they describe a slot in the old apiary's grid).

### Reports stay as they are

Deliberately unchanged. The apiary filter selects *which colonies* a report covers, not which slice of their history: a report shows what the selected colonies produced over their whole life. Relocation therefore has no effect on report figures, and no time-aware attribution is introduced.

### API

```
POST  /api/hives/:id/relocate     { toApiaryId, date?, reason?, notes? }
POST  /api/hives/relocate         { hiveIds[], toApiaryId, date?, reason?, notes? }   # bulk
```

Both behind the existing auth guard and apiary context. The bulk endpoint applies the same per-hive checks in a single transaction, so a partially completed migration cannot happen.

### Frontend

- **Move dialog** on the hive detail page: destination select, reason (Tracht / Einwinterung / free text), and a date control offering **"now" or an explicit date and time**.
- **Edit form**: the apiary select stays, but changing it opens the same date control and routes through `relocate()`, so the move is recorded instead of happening silently.
- **Timeline**: `RELOCATION` rendered with its own icon and an "Apiary A → Apiary B" line, using the snapshot names as fallback and marking a planned move as upcoming.
- **Bulk move** from the hive list: multi-select several colonies and move them together — the actual migratory-beekeeping workflow.

## Phases

1. **Data model** — enum values, `RelocationAction`, migration, Zod schemas in `shared-schemas`.
2. **Backend** — `HiveRelocationService`, endpoints, destination validation, position clearing, planned-move cron. Unit tests for the rules.
3. **Frontend, single colony** — React Query hook, move dialog, timeline rendering.
4. **Close the silent path** — edit form routed through the relocation service, with the date control.
5. **Bulk move** — multi-select in the hive list plus the bulk endpoint (later split onto its own branch).
6. **Polish** — English i18n, Playwright e2e, screenshots, PR texts.

## Settled along the way

- **Planned moves.** A future date is recorded but does not take effect until it arrives, applied by a scheduled job. `Hive.apiaryId` has to keep answering "where is this colony now".
- **Apiary references are not foreign keys.** Deleting an apiary cascades to its hives and their actions, which collides with a SET NULL on the same relocation rows and made deleting an apiary or user fail outright. The ids are plain columns, validated on write and snapshotted by name.
- **A completed move switches the active apiary** to the destination, since views are scoped through `x-apiary-id` and the colony would otherwise vanish from the page it was moved on.
