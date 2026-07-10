# Configurable first day of week and 12h/24h time format

## Summary
Hive Pal currently hard-codes two locale-dependent display conventions:

1. **Calendars always start on Sunday.** Many users (most of Europe, ISO-8601
   countries) expect the week to start on Monday.
2. **Times are always shown in 24-hour format (`17:00`).** Users used to the
   12-hour clock expect `5:00 PM`.

Neither can be changed today. This issue proposes two user-level preferences to
make both configurable.

## Proposed change
Add two settings in **Settings → General settings**, directly after the existing
**Date format** dropdown:

- **First day of week:** `Monday` / `Sunday`
- **Time format:** `24-hour (17:00)` / `12-hour (5:00 PM)`

Both are stored in the existing user-preferences JSON blob (no DB migration
needed) and applied app-wide:

- `First day of week` drives `weekStartsOn` on every calendar
  (`react-day-picker`), including the month calendar and all date pickers.
- `Time format` drives how times are rendered throughout the app (inspection
  date/time, lists, timelines, …).

## Acceptance criteria
- [ ] Two new selects appear in Settings → General, after "Date format".
- [ ] Choosing **Monday** makes every calendar render Monday as the first column;
      choosing **Sunday** keeps the current behaviour.
- [ ] Choosing **12-hour** renders times with AM/PM; **24-hour** keeps `HH:mm`.
- [ ] The choices persist across reloads and devices (stored in user preferences).
- [ ] Sensible defaults for users who never open settings (current behaviour:
      Sunday / 24-hour, unless we key the default off the active locale).
- [ ] New option labels are translatable (i18n).

## Notes / scope
- Preferences are already validated by `userPreferencesSchema`
  (`packages/shared-schemas`) and persisted to a JSON column, so this is
  additive and backward-compatible.
- Out of scope: changing the **date** format options (already configurable).
