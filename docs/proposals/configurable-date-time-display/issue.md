# Configurable first day of week and 12h/24h time format

## Summary
Hive Pal hard-codes two locale-dependent display conventions, and one of them is
currently applied **inconsistently**:

1. **Calendars always start on Sunday.** Many users (most of Europe and other
   ISO-8601 regions) expect the week to start on Monday, and there is no way to
   change it.
2. **Time format is inconsistent across the app and not user-configurable.** The
   inspections list renders times in **12-hour** format (e.g. `07:05 PM`,
   `02:00 AM`), while the new-inspection form (`/inspections/create`) renders and
   edits times in **24-hour** format (e.g. `17:31`). Users can neither make this
   consistent nor pick the format they prefer.

## Proposed change
Add two settings in **Settings → General settings**, directly after the existing
**Date format** dropdown:

- **First day of week:** `Monday` / `Sunday`
- **Time format:** `24-hour (17:00)` / `12-hour (5:00 PM)`

Both are stored in the existing user-preferences JSON blob (no DB migration
needed) and applied app-wide:

- **First day of week** drives `weekStartsOn` on every calendar
  (`react-day-picker`): the month calendar and all date pickers.
- **Time format** drives how times are rendered everywhere (inspection
  date/time, lists, timelines, …), which also removes the current 12h/24h
  inconsistency.

## Suggested defaults (with rationale)
Both settings should ship with sensible defaults for users who never open
settings.

**Time format → default `24-hour`.** The 24-hour clock is the international
standard (ISO 8601) and the dominant written format in the large majority of
countries; only about **18 countries** predominantly use the 12-hour clock in
daily written life (mainly English-influenced nations: US, Canada, Australia,
India, Pakistan, Philippines, Egypt, Mexico, …). A 24-hour default therefore
matches most of the world and the app's European origin, with 12-hour available
as an opt-in. [1][2]

**First day of week → default `Monday`.** This is a genuine trade-off:

- By **countries**, Monday is the clear majority: ~**160** countries treat
  Monday as the first day vs ~**67** for Sunday, and Monday is the ISO-8601
  first day. [3]
- By **population**, it is the other way around: ~**55%** of the world begins
  the week on **Sunday** (~4 bn people) vs ~**44%** on Monday (~3.3 bn), driven
  by China, India, the US and Japan. [3]

Given the ISO-8601 standard, the majority of countries, and Hive Pal's European
origin (hivepal.app), **Monday** is recommended as the default, with Sunday as an
opt-in. Note this flips the current hard-coded Sunday behaviour — reviewers who
prefer not to change existing users' calendars could instead keep Sunday as the
default; either is easy to configure.

## Acceptance criteria
- [ ] Two new selects appear in Settings → General, after "Date format".
- [ ] First day of week: **Monday** makes every calendar render Monday as the
      first column; **Sunday** restores the current behaviour.
- [ ] Time format: **12-hour** renders times with AM/PM; **24-hour** renders
      `HH:mm` — applied consistently in both the inspections list and the
      create/edit form.
- [ ] The choices persist across reloads and devices (stored in user preferences).
- [ ] New option labels are translatable (i18n).

## Notes / scope
- Preferences are already validated by `userPreferencesSchema`
  (`packages/shared-schemas`) and persisted to a JSON column, so this is
  additive and backward-compatible.
- Out of scope: changing the **date** format options (already configurable).

## Sources
- [1] World Population Review — Countries that use 12-hour time:
  https://worldpopulationreview.com/country-rankings/countries-that-use-12-hour-time
- [2] Wikipedia — Date and time representation by country:
  https://en.wikipedia.org/wiki/Date_and_time_representation_by_country
- [3] timeanddate.com — What is the first day of the week:
  https://www.timeanddate.com/calendar/days/first-day-of-the-week.html
