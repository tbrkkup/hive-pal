import { test, expect } from './fixtures';
import { Page } from '@playwright/test';
import { ApiaryFormPage, HiveFormPage } from 'page-objects';
import { generateRandomString } from './utils';

/**
 * End-to-end coverage for the cross-apiary "view all" mode.
 *
 * A fresh user is registered (a default "My Apiary" is auto-created). We add a
 * hive to that apiary, create a second apiary with its own hive, then verify:
 *   - selecting a single apiary filters the hive list to that apiary,
 *   - "All apiaries" shows hives from every apiary (flat /hives list),
 *   - the dashboard groups hives under each apiary in view-all mode.
 *
 * The active apiary is chosen through the switcher before creating each hive, so
 * the hive form defaults to it (no dependency on the apiary <select> control).
 *
 * Requires a running stack (frontend + backend + database), e.g. the preview
 * environment. Run with: `BASE_URL=... pnpm --filter e2e test view-all-apiaries`.
 */

const selectApiary = async (page: Page, name: string) => {
  await page.getByTestId('apiary-switcher').click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
};

const selectAllApiaries = async (page: Page) => {
  await page.getByTestId('apiary-switcher').click();
  await page.getByTestId('apiary-switcher-all').click();
};

test.describe('View all apiaries', () => {
  test('disabling the apiary filter shows hives from every apiary', async ({
    page,
  }) => {
    const suffix = Date.now().toString().slice(-5);
    const apiaryA = 'My Apiary'; // auto-created default apiary
    const apiaryB = `Ridge Bravo ${suffix}`;
    const hiveA = `Hive Anna ${suffix}`;
    const hiveB = `Hive Boris ${suffix}`;

    // --- Register a brand-new user (auto-creates "My Apiary") ---
    const email = `viewall-${Date.now()}@example.com`;
    const password = generateRandomString();

    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('email').fill(email);
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(password);
    await page
      .getByRole('textbox', { name: 'Confirm Password' })
      .fill(password);
    await page.getByRole('textbox', { name: 'Display Name' }).fill('View All');
    await page
      .getByRole('checkbox', { name: 'I agree to the Privacy Policy' })
      .click();
    await page.getByRole('button', { name: /register/i }).click();

    // Wait for registration to complete (session cookie set + navigation away).
    await page.waitForURL(url => !url.pathname.startsWith('/register'), {
      timeout: 15000,
    });

    // The app shell (with the apiary switcher) is available on any app route.
    await page.goto('/hives', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('apiary-switcher')).toBeVisible({
      timeout: 15000,
    });

    const hiveForm = new HiveFormPage(page);
    const apiaryForm = new ApiaryFormPage(page);

    // --- Add a hive to the default apiary (active by default) ---
    await page.goto('/hives/create', { waitUntil: 'domcontentloaded' });
    await hiveForm.fillHiveForm({ name: hiveA });
    await hiveForm.submitForm();

    // --- Create a second apiary and make it the active one ---
    await page.goto('/apiaries/create', { waitUntil: 'domcontentloaded' });
    await apiaryForm.fillApiaryForm({ name: apiaryB });
    await apiaryForm.submitForm();
    await selectApiary(page, apiaryB);

    // --- Add a hive to the second apiary (now active) ---
    await page.goto('/hives/create', { waitUntil: 'domcontentloaded' });
    await hiveForm.fillHiveForm({ name: hiveB });
    await hiveForm.submitForm();

    // --- Single apiary selected: /hives is filtered to that apiary ---
    await page.goto('/hives', { waitUntil: 'domcontentloaded' });
    await selectApiary(page, apiaryA);
    await expect(page.getByText(hiveA)).toBeVisible();
    await expect(page.getByText(hiveB)).toHaveCount(0);

    // --- "All apiaries": /hives shows every hive across apiaries (flat list) ---
    await selectAllApiaries(page);
    await expect(page.getByText(hiveA)).toBeVisible();
    await expect(page.getByText(hiveB)).toBeVisible();

    // --- Dashboard groups hives under each apiary in view-all mode ---
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page.getByText(hiveA)).toBeVisible();
    await expect(page.getByText(hiveB)).toBeVisible();
    await expect(page.getByText(apiaryB, { exact: true })).toBeVisible();
  });
});
