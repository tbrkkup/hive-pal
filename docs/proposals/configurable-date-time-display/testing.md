# Playwright test log — PR A (configurable week start & time format)

Environment: local full stack (native PostgreSQL 16, NestJS backend on :3000,
Vite frontend on :5173), seeded user `test@test.com`. Four inspections on
"Hive 01": 2026-07-08 19:05, 2026-07-06 09:30, 2026-06-13 17:00 (timed) and
2025-02-01 (all-day). Driven headless via Playwright (Chromium).

## Test cases

| # | Steps | Expected | Result | Screenshot |
|---|-------|----------|--------|------------|
| 1 | Open Settings → General | New "First day of week" and "Time format" selects appear directly after "Date Format" | PASS | `screenshots/A1-settings-default.png` |
| 2 | Set First day of week = Monday, Time format = 12-hour; Save | Selects show "Monday" / "12-hour (5:00 PM)"; save succeeds | PASS | `screenshots/A2-settings-monday-12h.png` |
| 3 | Open Inspections list (12h active) | Times render 12-hour: `7:05 PM`, `9:30 AM`, `5:00 PM`, `12:00 AM` | PASS | `screenshots/A3-inspections-12h.png` |
| 4 | Set First day of week = Sunday, Time format = 24-hour; Save; open list | Times render 24-hour: `19:05`, `09:30`, `17:00`, `00:00` | PASS | `screenshots/A6-inspections-24h.png` |
| 5 | With Monday preference, open month calendar (/calendar) | Weekday header starts with **Mo** (Mo Tu We Th Fr Sa Su) | PASS | `screenshots/A9-calendar-monday.png` |
| 6 | With Sunday preference, open month calendar | Weekday header starts with **Su** (Su Mo Tu We Th Fr Sa) | PASS | `screenshots/A10-calendar-sunday.png` |

## Notes
- The time-format inconsistency reported in the issue is resolved: the list
  (previously hard-coded `en-US` 12h) and the create/edit form (previously
  hard-coded 24h) now both follow the single `timeFormat` preference.
- Calendars honor the preference globally via a default `weekStartsOn` in the
  shared `Calendar` component — no per-call-site changes required.
- Defaults for a brand-new user: Monday / 24-hour (per the issue rationale).

## Reviewer feedback
_(to be filled in after review)_
