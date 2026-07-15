# Faster inspection date/time entry: remember last used time + a "Now" button

## Summary
When creating a new inspection, the **"All day"** toggle is always enabled by
default, so beekeepers who record the actual time have to turn it off and
re-enter the time **every single time**. This proposes two small,
complementary quality-of-life improvements to the date/time entry:

1. **Remember the last used time** and pre-fill it on the next new inspection.
2. **A "Now" button** next to the date/time that sets the inspection to the
   current date and time in one click.

Many beekeepers carry out their inspections at similar times of day (for
example, in the evening after their day job ends), so pre-filling the last-used
time saves that repetitive step for a lot of users.

There is also a related oddity in the current **"All day"** behaviour worth
noting: "All day" does not store a time-agnostic date — it stores the timestamp
at **00:00 UTC**. For a user in, e.g., Central European Summer Time (UTC+2) this
then renders as **"02:00 AM"** in the inspection list, which is confusing (the
several "02:00 AM" rows in the list are actually all-day inspections). Handling
the default time better also reduces this confusion.

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

### "Now" button
Next to the date/time row on the inspection form, a **"Now"** button sets the
inspection to the **current date and time** and turns **"All day" off**, so
logging an inspection you are doing right now is a single click — independent of
whatever the remembered default happened to be.

## Acceptance criteria
- [ ] Creating a new inspection restores the last-used "All day" state.
- [ ] When the last inspection had a specific time, that time (HH:mm) is
      pre-filled and "All day" is off.
- [ ] Editing an existing inspection is unaffected (it keeps that inspection's
      own stored time / all-day value).
- [ ] The remembered value survives a page reload.
- [ ] First-ever inspection (no history yet) keeps today's sensible default.
- [ ] A "Now" button next to the date/time sets the current date+time and turns
      "All day" off; its label is translatable (i18n).

## Notes / scope
- The last-used value is a lightweight, per-user UX convenience and can be
  persisted client-side (`localStorage`), keeping this change frontend-only with
  no API or schema changes.
- The shared `InspectionDateTimePicker` already restores the previous time when
  toggling "All day" **within a single form**; this issue extends that memory
  **across forms/sessions** by seeding the form's default value.
- The "All day = 00:00 UTC renders as 02:00" issue is noted here as motivation;
  whether to additionally fix all-day rendering (show a true all-day event
  without a misleading local time) can be done here or split into a follow-up.
