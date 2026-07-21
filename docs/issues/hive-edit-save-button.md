# Bug: hive edit form fails silently — "save" button appears to do nothing

## Summary

On the **Edit Hive** page (`/hives/:id/edit`), pressing the submit button often
does nothing at all: no request is sent, no error is shown, the page just stays
as it is. On top of that, the button is labeled **"Edit Hive"** (the page
title's translation key) instead of an actionable **"Save"**, so it's not even
clear that it is the save button.

## Steps to reproduce

1. Have a hive whose status is anything other than `ACTIVE` or `INACTIVE` —
   e.g. `UNKNOWN`, `DEAD`, `SOLD`, or `ARCHIVED`. (Any hive can get such a
   status through the status button on the hive detail page.)
2. Open **Edit Hive** for that hive, change the name (or any field).
3. Press the button at the bottom ("Edit Hive").

**Expected:** the hive is saved, or a validation error is shown.
**Actual:** nothing happens — no network request, no toast, no field error.

## Root cause

`apps/frontend/src/pages/hive/components/hive-form.tsx` defines its own local
Zod schema for the form:

```ts
const hiveSchema = z.object({
  // …
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  // …
});
```

The real `HiveStatus` enum (`packages/shared-schemas`) has **six** values:
`ACTIVE, INACTIVE, DEAD, SOLD, UNKNOWN, ARCHIVED`. In edit mode the form is
`reset()` with the hive's actual status, so for any hive whose status is not
`ACTIVE`/`INACTIVE`, `zodResolver` rejects the form on submit.

Crucially, the `status` field is **not rendered anywhere in this form** — it is
carried along invisibly. React-hook-form's `handleSubmit` routes the failure to
the (absent) field error display, so the rejection is completely invisible:
the submit handler never runs and no message appears. The result is a dead
save button.

## Fix

1. **Validate `status` against the real enum** — use `hiveStatusSchema` from
   `shared-schemas` instead of the hardcoded two-value enum, so editing a hive
   in any status works.
2. **Surface unexpected validation failures** — pass an `onInvalid` handler to
   `handleSubmit` that shows a toast with the failing field(s). Any future
   schema/form mismatch becomes a visible error instead of a silently dead
   button.
3. **Label the button "Save"** (`common:actions.save`) in edit mode instead of
   reusing the "Edit Hive" page title.

## Notes

- No backend change: `updateHiveSchema` already accepts every `HiveStatus`.
- Regression-tested with a Playwright component test that mounts the form for
  a hive with status `UNKNOWN` and asserts that pressing **Save** actually
  issues the update request.
