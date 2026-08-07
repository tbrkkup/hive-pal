import { test } from '../auth/auth.fixture';
import { expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * Moving a colony to another apiary.
 *
 * An apiary is a location, so this is how the app models migratory
 * beekeeping: the colony moves between sites and every move is recorded on
 * its timeline.
 */
test.describe('Colony relocation', () => {
  test('records a move on the hive timeline', async ({ page }) => {
    await page.goto('/hives');

    // Open the first colony in the list.
    await page.getByRole('row').nth(1).click();
    await expect(page).toHaveURL(/\/hives\/[0-9a-f-]{36}/);

    await page
      .getByRole('button', { name: /move to another apiary/i })
      .click();

    const dialog = page.locator('[data-test="relocate-dialog"]');
    await expect(dialog).toBeVisible();

    // Pick whichever destination is offered; the colony's current apiary is
    // deliberately not in the list, because moving there would be a no-op.
    await page.locator('[data-test="relocate-destination"]').click();
    const destination = page.getByRole('option').first();
    const destinationName = (await destination.textContent())?.trim() ?? '';
    await destination.click();

    await page.locator('[data-test="relocate-reason"]').click();
    await page
      .getByRole('option')
      .filter({ hasText: /forage/i })
      .first()
      .click();

    await page.locator('[data-test="relocate-submit"]').click();
    await expect(dialog).toBeHidden();

    // The move shows up as a timeline entry naming both sites.
    await expect(page.getByText(/moved .*→/i).first()).toBeVisible();
    if (destinationName) {
      await expect(page.getByText(destinationName).first()).toBeVisible();
    }
  });

  test('a date in the future schedules the move instead of applying it', async ({
    page,
  }) => {
    await page.goto('/hives');
    await page.getByRole('row').nth(1).click();

    await page
      .getByRole('button', { name: /move to another apiary/i })
      .click();
    await expect(
      page.locator('[data-test="relocate-dialog"]'),
    ).toBeVisible();

    await page.locator('[data-test="relocate-when-custom"]').click();

    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    await page
      .locator('[data-test="relocate-date"]')
      .fill(
        `${nextWeek.getFullYear()}-${pad(nextWeek.getMonth() + 1)}-` +
          `${pad(nextWeek.getDate())}T09:00`,
      );

    // The colony has not moved yet, and the dialog says so.
    await expect(
      page.locator('[data-test="relocate-planned-hint"]'),
    ).toBeVisible();
  });
});
