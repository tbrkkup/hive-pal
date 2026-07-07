import { test, expect } from './fixtures';
import { Page } from '@playwright/test';
import { ApiaryFormPage } from 'page-objects';
import { generateRandomString } from './utils';

/**
 * The cross-apiary "view all" choice must survive closing and reopening the app.
 *
 * Regression guard: the dashboard auto-select effect must not turn "view all"
 * off while the apiaries query is still loading/rehydrating on a cold start —
 * otherwise a reopen would silently fall back to the first single apiary.
 *
 * Requires a running stack. Run with:
 *   `BASE_URL=... pnpm --filter e2e test view-all-persistence`.
 */

const clickSwitcherItem = async (
  page: Page,
  item: ReturnType<Page['locator']>,
) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.getByTestId('apiary-switcher').click();
    try {
      await item.click({ timeout: 3000 });
      return;
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  throw new Error('Could not click switcher item');
};

const expectViewAll = async (page: Page) => {
  await expect(
    page.getByTestId('apiary-switcher').getByText('All apiaries'),
  ).toBeVisible({ timeout: 15000 });
  const viewAll = await page.evaluate(() =>
    localStorage.getItem('hive_pal_view_all_apiaries'),
  );
  expect(viewAll).toBe('true');
};

test('the "view all apiaries" choice survives a reopen', async ({ page }) => {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith('http://localhost:5173')) return route.abort();
    if (/\/api\/(weather|hivescale)/.test(url)) return route.abort();
    return route.continue();
  });

  // --- Register a fresh user (auto-creates "My Apiary") ---
  const email = `persist-${Date.now()}@example.com`;
  const password = generateRandomString();
  await page.goto('/register', { waitUntil: 'commit' });
  await page.getByLabel('email').fill(email);
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill(password);
  await page.getByRole('textbox', { name: 'Confirm Password' }).fill(password);
  await page.getByRole('textbox', { name: 'Display Name' }).fill('Persist');
  await page
    .getByRole('checkbox', { name: 'I agree to the Privacy Policy' })
    .click();
  await page.getByRole('button', { name: /register/i }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/register'), {
    timeout: 15000,
  });
  await expect(page.getByTestId('apiary-switcher')).toBeVisible({
    timeout: 15000,
  });

  // --- Create a second apiary so "view all" is meaningful ---
  const apiaryForm = new ApiaryFormPage(page);
  await page.goto('/apiaries/create', { waitUntil: 'commit' });
  await apiaryForm.fillApiaryForm({ name: `Ridge ${Date.now().toString().slice(-5)}` });
  await apiaryForm.submitForm();

  // --- Select "All apiaries" ---
  await clickSwitcherItem(page, page.getByTestId('apiary-switcher-all'));
  await expectViewAll(page);

  // --- 1) A plain reload keeps "view all" ---
  await page.reload({ waitUntil: 'commit' });
  await expect(page.getByTestId('apiary-switcher')).toBeVisible({
    timeout: 15000,
  });
  await expectViewAll(page);

  // --- 2) A cold reopen (React Query cache gone, fresh navigation) keeps it ---
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('hive-pal-query') || k.includes('query-cache')) {
        localStorage.removeItem(k);
      }
    }
  });
  await page.goto('/hives', { waitUntil: 'commit' });
  await expect(page.getByTestId('apiary-switcher')).toBeVisible({
    timeout: 15000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);
  await expectViewAll(page);
});
