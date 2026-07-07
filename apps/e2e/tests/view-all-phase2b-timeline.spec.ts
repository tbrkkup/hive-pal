import { test, expect } from './fixtures';
import { Page } from '@playwright/test';
import { ApiaryFormPage, HiveFormPage } from 'page-objects';
import { generateRandomString } from './utils';

/**
 * Phase 2b + 3b coverage for the cross-apiary "view all" mode.
 *
 * Phase 2b makes the remaining timeline read endpoints (actions, quick-checks,
 * photos, documents) accept `x-apiary-id: all`; Phase 3b un-hides the dashboard
 * activity timeline in view-all mode so it aggregates across every apiary.
 *
 * The test:
 *   1. registers a fresh user (default "My Apiary" = apiary A),
 *   2. records a quick check in apiary A, then in a second apiary B,
 *   3. asserts the Phase 2b endpoints answer `x-apiary-id: all` with 200,
 *   4. asserts the dashboard timeline is single-apiary-scoped when one apiary is
 *      selected, and aggregates BOTH apiaries' activity under "All apiaries".
 *
 * Requires a running stack (frontend + backend + database).
 * Run with: `BASE_URL=... pnpm --filter e2e test view-all-phase2b`.
 */

const SHOT_DIR =
  process.env.SHOT_DIR ||
  '/tmp/claude-0/-home-user/d4f56f04-fc33-515b-bc80-dc0a3231b16e/scratchpad';

// Open the switcher dropdown and click an item, retrying if a background query
// refetch detaches the freshly-opened Radix menu mid-click.
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
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  throw new Error('Could not click switcher item');
};

const selectApiary = (page: Page, name: string) =>
  clickSwitcherItem(
    page,
    page.getByRole('menuitem', { name: new RegExp(name) }),
  );

const selectAllApiaries = (page: Page) =>
  clickSwitcherItem(page, page.getByTestId('apiary-switcher-all'));

const gotoDashboard = async (page: Page) => {
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByTestId('apiary-switcher')).toBeVisible({
    timeout: 15000,
  });
};

// Record an apiary-level quick check from the dashboard "Add Entry" menu.
// Retries the Radix dropdown open the same way the switcher helper does.
const addQuickCheck = async (page: Page, note: string) => {
  await gotoDashboard(page);
  for (let attempt = 0; attempt < 5; attempt++) {
    await page
      .getByRole('button', { name: /Add Entry/i })
      .first()
      .click();
    try {
      await page
        .getByRole('menuitem', { name: /Quick Check/i })
        .click({ timeout: 3000 });
      break;
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  const textarea = page.getByPlaceholder('What did you observe?');
  await expect(textarea).toBeVisible({ timeout: 10000 });
  await textarea.fill(note);
  await page.getByRole('button', { name: /Save Quick Check/i }).click();
  await expect(page.getByText('Quick check saved')).toBeVisible({
    timeout: 15000,
  });
};

test.describe('View all apiaries — Phase 2b/3b (timeline)', () => {
  test('the dashboard timeline aggregates activity across apiaries', async ({
    page,
  }) => {
    const suffix = Date.now().toString().slice(-5);
    const apiaryA = 'My Apiary'; // auto-created default apiary
    const apiaryB = `Ridge Bravo ${suffix}`;
    const noteA = `Checked Anna ${suffix}`;
    const noteB = `Checked Boris ${suffix}`;

    // Record any timeline endpoint that errors while loading in view-all mode —
    // a 4xx/5xx here would mean the Phase 2b `x-apiary-id: all` opt-in is missing.
    const timelineErrors: string[] = [];
    page.on('response', res => {
      const u = res.url();
      if (
        /\/api\/(actions|quick-checks|photos|documents)/.test(u) &&
        res.status() >= 400
      ) {
        timelineErrors.push(`${res.status()} ${u}`);
      }
    });

    // Abort external analytics / slow third-party endpoints so they don't starve
    // the requests this test depends on.
    await page.route('**/*', route => {
      const url = route.request().url();
      if (!url.startsWith('http://localhost:5173')) return route.abort();
      if (/\/api\/(weather|hivescale)/.test(url)) return route.abort();
      return route.continue();
    });

    // --- Register a brand-new user (auto-creates "My Apiary") ---
    const email = `phase2b-${Date.now()}@example.com`;
    const password = generateRandomString();
    await page.goto('/register', { waitUntil: 'commit' });
    await page.getByLabel('email').fill(email);
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(password);
    await page.getByRole('textbox', { name: 'Confirm Password' }).fill(password);
    await page
      .getByRole('textbox', { name: 'Display Name' })
      .fill('Phase Two B');
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

    // --- Add a hive to apiary A (used for the nested measurements probe) ---
    const hiveA = `Hive Anna ${suffix}`;
    const hiveForm = new HiveFormPage(page);
    await page.goto('/hives/create', { waitUntil: 'commit' });
    await hiveForm.fillHiveForm({ name: hiveA });
    await hiveForm.submitForm();

    // --- Record a quick check in apiary A (active by default) ---
    await addQuickCheck(page, noteA);

    // --- Create a second apiary, make it active, record a quick check there ---
    const apiaryForm = new ApiaryFormPage(page);
    await page.goto('/apiaries/create', { waitUntil: 'commit' });
    await apiaryForm.fillApiaryForm({ name: apiaryB });
    await apiaryForm.submitForm();
    await selectApiary(page, apiaryB);
    await addQuickCheck(page, noteB);

    // --- Phase 2b: the new read endpoints answer `x-apiary-id: all` (200) ---
    await selectAllApiaries(page);
    const statuses = await page.evaluate(async () => {
      const endpoints = [
        '/api/actions',
        '/api/quick-checks',
        '/api/photos',
        '/api/documents',
      ];
      const out: Record<string, number> = {};
      for (const ep of endpoints) {
        const r = await fetch(ep, {
          headers: { 'x-apiary-id': 'all' },
          credentials: 'include',
        });
        out[ep] = r.status;
      }
      return out;
    });
    expect(statuses).toEqual({
      '/api/actions': 200,
      '/api/quick-checks': 200,
      '/api/photos': 200,
      '/api/documents': 200,
    });

    // Nested detail-page reads (measurements sits under the /api/hives prefix
    // and therefore receives `x-apiary-id: all` in view-all mode) must also opt
    // in — otherwise a hive detail from a non-selected apiary would 400.
    const nestedStatuses = await page.evaluate(async () => {
      const list = await fetch('/api/hives', {
        headers: { 'x-apiary-id': 'all' },
        credentials: 'include',
      });
      const hives = (await list.json()) as Array<{ id: string }>;
      const hiveId = hives[0]?.id;
      const probe = (path: string) =>
        fetch(path, {
          headers: { 'x-apiary-id': 'all' },
          credentials: 'include',
        }).then(r => r.status);
      return {
        list: list.status,
        measurements: await probe(`/api/hives/${hiveId}/measurements`),
        latest: await probe(`/api/hives/${hiveId}/measurements/latest`),
      };
    });
    expect(nestedStatuses).toEqual({ list: 200, measurements: 200, latest: 200 });

    // --- Single apiary: the dashboard timeline is scoped to that apiary ---
    await gotoDashboard(page);
    await selectApiary(page, apiaryA);
    await expect(page.getByText(noteA).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(noteB)).toHaveCount(0);
    await page.screenshot({
      path: `${SHOT_DIR}/p2b-01-single-apiary-timeline.png`,
      fullPage: true,
    });

    // --- "All apiaries": the timeline aggregates activity from every apiary ---
    await selectAllApiaries(page);
    await expect(page.getByText(noteA).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(noteB).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: `${SHOT_DIR}/p3b-02-all-apiaries-timeline.png`,
      fullPage: true,
    });

    // No timeline endpoint errored while loading the cross-apiary view.
    expect(timelineErrors).toEqual([]);
  });
});
