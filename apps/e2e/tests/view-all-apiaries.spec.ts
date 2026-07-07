import { test, expect } from './fixtures';
import { ApiaryFormPage, HiveFormPage } from 'page-objects';
import { generateRandomString } from './utils';

/**
 * End-to-end coverage for the cross-apiary "view all" mode.
 *
 * A fresh user is registered (which starts the onboarding wizard), creates a
 * first apiary + hive through onboarding, then a second apiary + hive. We then
 * verify that:
 *   - selecting a single apiary filters the dashboard to that apiary's hive,
 *   - "All apiaries" shows hives from every apiary, grouped under each apiary,
 *   - the /hives list shows every hive across apiaries (flat list).
 *
 * Requires a running stack (frontend + backend + database), e.g. the preview
 * environment. Run with: `BASE_URL=... pnpm --filter e2e test view-all-apiaries`.
 */
test.describe('View all apiaries', () => {
  test('disabling the apiary filter shows hives from every apiary', async ({
    page,
    onboardingPage,
  }) => {
    const suffix = Date.now().toString().slice(-5);
    const apiaryA = `Meadow Alpha ${suffix}`;
    const apiaryB = `Ridge Bravo ${suffix}`;
    const hiveA = `Hive Anna ${suffix}`;
    const hiveB = `Hive Boris ${suffix}`;

    // --- Register a brand-new user (lands on the onboarding welcome screen) ---
    await page.goto('/login');
    const email = `viewall-${Date.now()}@example.com`;
    const password = generateRandomString();

    await page.getByRole('link', { name: 'Sign Up' }).click();
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

    // --- Onboarding: create the first apiary + hive ---
    await onboardingPage.completeOnboarding({
      apiaryName: apiaryA,
      hiveName: hiveA,
    });
    await expect(page).toHaveURL('/');

    // --- Create a second apiary ---
    const apiaryForm = new ApiaryFormPage(page);
    await page.goto('/apiaries/create');
    await apiaryForm.fillApiaryForm({ name: apiaryB });
    await apiaryForm.submitForm();

    // --- Create a hive in the second apiary ---
    const hiveForm = new HiveFormPage(page);
    await page.goto('/hives/create');
    await hiveForm.fillHiveForm({ name: hiveB, apiaryName: apiaryB });
    await hiveForm.submitForm();

    // --- Select the first apiary: dashboard is filtered to it ---
    await page.goto('/');
    await page.getByTestId('apiary-switcher').click();
    await page.getByRole('menuitem', { name: new RegExp(apiaryA) }).click();

    await expect(page.getByText(hiveA)).toBeVisible();
    await expect(page.getByText(hiveB)).toHaveCount(0);

    // --- Switch to "All apiaries": both apiaries' hives are shown, grouped ---
    await page.getByTestId('apiary-switcher').click();
    await page.getByTestId('apiary-switcher-all').click();

    // Both apiary group headings are present.
    await expect(page.getByText(apiaryA, { exact: true })).toBeVisible();
    await expect(page.getByText(apiaryB, { exact: true })).toBeVisible();
    // Both hives are visible on the dashboard.
    await expect(page.getByText(hiveA)).toBeVisible();
    await expect(page.getByText(hiveB)).toBeVisible();

    // --- The /hives list shows every hive across apiaries (flat list) ---
    await page.goto('/hives');
    await expect(page.getByText(hiveA)).toBeVisible();
    await expect(page.getByText(hiveB)).toBeVisible();
  });
});
