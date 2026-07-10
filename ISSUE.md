# Remember last used inspection time as the default for new inspections

## Summary
When creating a new inspection, the **"All day"** toggle is always enabled by
default, so the time picker is hidden. Beekeepers who record the actual time of
their inspections have to turn off "All day" and re-enter the time **every
single time**.

## Proposed change
Remember the last time-related choice the user made and pre-fill it on the next
new inspection:

- If the user's last inspection had **All day** on → the next new inspection
  defaults to **All day** on.
- If the user's last inspection was at a specific time → the next new inspection
  defaults to **All day off**, with that time already filled in.

### Example
> I log an inspection on **13 Jun at 17:00**. When I now create a new inspection,
> **"All day" is off** and **17:00** is already entered.

## Acceptance criteria
- [ ] Creating a new inspection restores the last-used "All day" state.
- [ ] When the last inspection had a specific time, that time (HH:mm) is
      pre-filled and "All day" is off.
- [ ] Editing an existing inspection is unaffected (it keeps that inspection's
      own stored time / all-day value).
- [ ] The remembered value survives a page reload.
- [ ] First-ever inspection (no history yet) keeps today's sensible default.

## Notes / scope
- The last-used value is a lightweight, per-user UX convenience and can be
  persisted client-side (`localStorage`), keeping this change frontend-only with
  no API or schema changes.
- The shared `InspectionDateTimePicker` already restores the previous time when
  toggling "All day" **within a single form**; this issue extends that memory
  **across forms/sessions** by seeding the form's default value.
