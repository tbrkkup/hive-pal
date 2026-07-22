import { test, expect } from '@playwright/experimental-ct-react';
import { MemoryRouter } from 'react-router-dom';
import { HiveForm } from './hive-form';
import type { Page } from '@playwright/test';

const APIARY_ID = '11111111-1111-4111-8111-111111111111';
const APIARY_2_ID = '44444444-4444-4444-8444-444444444444';
const HIVE_ID = '22222222-2222-4222-8222-222222222222';

// Regression test for the silently-dead save button: a hive whose status is
// outside ACTIVE/INACTIVE (here UNKNOWN) used to fail the form's local zod
// schema on an unrendered field, so submitting sent no request and showed no
// error.
async function mockApi(page: Page, requests: string[]) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const apiaryHeader = route.request().headers()['x-apiary-id'] ?? '-';
    const key = `${route.request().method()} ${url.pathname} [${apiaryHeader}]`;
    requests.push(key);
    if (url.pathname === '/api/apiaries') {
      return route.fulfill({
        json: {
          apiaries: [
            { id: APIARY_ID, name: 'Home Apiary', role: 'OWNER', settings: {} },
            {
              id: APIARY_2_ID,
              name: 'Out Apiary',
              role: 'OWNER',
              settings: {},
            },
          ],
          pendingMemberships: 0,
        },
      });
    }
    if (url.pathname === `/api/hives/${HIVE_ID}`) {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          json: {
            id: HIVE_ID,
            name: 'Volk 7',
            apiaryId: APIARY_ID,
            status: 'UNKNOWN',
            updatedAt: '2026-07-21T12:00:00.000Z',
          },
        });
      }
      return route.fulfill({
        json: {
          id: HIVE_ID,
          name: 'Volk 7',
          apiaryId: APIARY_ID,
          status: 'UNKNOWN',
          installationDate: '2025-04-12T10:00:00.000Z',
          updatedAt: '2026-07-14T09:00:00.000Z',
          settings: {},
          boxes: [],
          alerts: [],
          hiveScore: null,
          activeQueen: null,
          parentHiveId: null,
          parentHive: null,
          offspring: [],
        },
      });
    }
    return route.fulfill({ json: [] });
  });
}

test('saving a hive with a non-ACTIVE status sends the update', async ({
  mount,
  page,
}) => {
  const requests: string[] = [];
  await mockApi(page, requests);

  await mount(
    <MemoryRouter>
      <HiveForm hiveId={HIVE_ID} />
    </MemoryRouter>,
  );

  // Wait for the hive to load into the form.
  await expect(page.getByPlaceholder('hive 01')).toHaveValue('Volk 7');

  // The submit button is labeled "Save" (not the page title).
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await save.click();

  // The update request actually goes out (used to be silently swallowed).
  await expect
    .poll(() =>
      requests.filter((r) => r.startsWith(`PATCH /api/hives/${HIVE_ID}`)),
    )
    .toHaveLength(1);
});

test('moving a hive to another apiary authorizes against the current one', async ({
  mount,
  page,
}) => {
  const requests: string[] = [];
  await mockApi(page, requests);

  await mount(
    <MemoryRouter>
      <HiveForm hiveId={HIVE_ID} />
    </MemoryRouter>,
  );
  await expect(page.getByPlaceholder('hive 01')).toHaveValue('Volk 7');

  // Switch the apiary select from Home Apiary to Out Apiary.
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Out Apiary/ }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // The PATCH must be authorized against the hive's CURRENT apiary — with the
  // new apiary in the header the backend can't find the hive (the regression
  // this test pins down).
  await expect
    .poll(() =>
      requests.filter(
        (r) => r === `PATCH /api/hives/${HIVE_ID} [${APIARY_ID}]`,
      ),
    )
    .toHaveLength(1);
});
