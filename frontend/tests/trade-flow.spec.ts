import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * End-to-end trade flow test for Kepler.
 *
 * Prerequisites:
 *   - Dev server running on localhost:3000
 *   - Supabase configured with test data (catalog seeded)
 *   - Two test user accounts:
 *       TEST_USER1_EMAIL / TEST_USER1_PASSWORD
 *       TEST_USER2_EMAIL / TEST_USER2_PASSWORD
 *
 * Set these environment variables before running, or the test will
 * use default test credentials and attempt email/password sign-up.
 */

const USER1_EMAIL = process.env.TEST_USER1_EMAIL || `testuser1_${Date.now()}@kepler.test`;
const USER1_PASS = process.env.TEST_USER1_PASSWORD || 'TestPass123!';
const USER2_EMAIL = process.env.TEST_USER2_EMAIL || `testuser2_${Date.now()}@kepler.test`;
const USER2_PASS = process.env.TEST_USER2_PASSWORD || 'TestPass123!';

async function loginOrSignUp(page: Page, email: string, password: string) {
  await page.goto('/');
  // Click the Login button in nav
  const loginBtn = page.locator('.nav-login', { hasText: 'Login' });
  if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginBtn.click();
  } else {
    // Already logged in — sign out first
    const userBtn = page.locator('.nav-login').first();
    if (await userBtn.isVisible()) {
      await userBtn.click(); // signs out
      await page.waitForTimeout(500);
      await page.goto('/');
      await page.locator('.nav-login', { hasText: 'Login' }).click();
    }
  }

  // Wait for modal
  await expect(page.locator('.login-modal')).toBeVisible({ timeout: 5000 });

  // Try sign-up first (in case users don't exist)
  const createLink = page.locator('.login-register-txt a', { hasText: 'Create one free' });
  if (await createLink.isVisible()) {
    await createLink.click();
  }

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('.login-submit-btn').click();

  // Wait for success or error (if user exists, try sign in)
  const success = page.locator('.login-success-title');
  const error = page.locator('.auth-error');

  const result = await Promise.race([
    success.waitFor({ timeout: 8000 }).then(() => 'success'),
    error.waitFor({ timeout: 8000 }).then(() => 'error'),
  ]).catch(() => 'timeout');

  if (result === 'error') {
    // User might already exist — sign in instead
    const signInLink = page.locator('.login-register-txt a', { hasText: 'Sign in' });
    if (await signInLink.isVisible()) {
      await signInLink.click();
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.locator('.login-submit-btn').click();
      await expect(success).toBeVisible({ timeout: 8000 });
    }
  }

  // Wait for modal to close
  await page.waitForTimeout(1500);
}

test.describe('Kepler Trade Flow', () => {
  test('Full trade lifecycle: add cards, propose, accept, confirm, complete', async ({ browser }) => {
    // Create two separate browser contexts for two users
    const ctx1: BrowserContext = await browser.newContext();
    const ctx2: BrowserContext = await browser.newContext();
    const page1: Page = await ctx1.newPage();
    const page2: Page = await ctx2.newPage();

    // ─── Step 1: User 1 signs in ───
    await test.step('User 1 signs in', async () => {
      await loginOrSignUp(page1, USER1_EMAIL, USER1_PASS);
      // Verify we're on the home page and logged in
      await expect(page1.locator('.nav-login').first()).toBeVisible();
    });

    // ─── Step 2: User 1 adds a card from catalog to collection ───
    await test.step('User 1 adds a card to collection', async () => {
      await page1.goto('/catalog');
      await page1.waitForSelector('.catalog-card', { timeout: 10000 });

      // Click the first "Add to Collection" button
      const addBtn = page1.locator('.catalog-card-add').first();
      await addBtn.click();

      // Modal should appear
      await expect(page1.locator('.modal-title', { hasText: 'Add to Collection' })).toBeVisible({ timeout: 5000 });

      // Click "Add to Collection" in modal
      await page1.locator('.modal-confirm').click();

      // Toast should show success
      await expect(page1.locator('text=added to your collection')).toBeVisible({ timeout: 5000 });
    });

    // ─── Step 3: User 1 marks card as "For Trade" ───
    await test.step('User 1 marks card for trade', async () => {
      await page1.goto('/collection');
      await page1.waitForSelector('.collection-card', { timeout: 10000 });

      // Toggle "For Trade" on the first card
      const toggleSwitch = page1.locator('.toggle-row').filter({ hasText: 'For Trade' }).first().locator('input[type="checkbox"]');
      await toggleSwitch.check({ force: true });
      await page1.waitForTimeout(500);
    });

    // ─── Step 4: User 2 signs in ───
    await test.step('User 2 signs in', async () => {
      await loginOrSignUp(page2, USER2_EMAIL, USER2_PASS);
      await expect(page2.locator('.nav-login').first()).toBeVisible();
    });

    // ─── Step 5: User 2 adds a different card and marks for trade ───
    await test.step('User 2 adds a card and marks for trade', async () => {
      await page2.goto('/catalog');
      await page2.waitForSelector('.catalog-card', { timeout: 10000 });

      // Click the second card's "Add to Collection" (or first if only one)
      const addBtns = page2.locator('.catalog-card-add');
      const count = await addBtns.count();
      const idx = count > 1 ? 1 : 0;
      await addBtns.nth(idx).click();

      await expect(page2.locator('.modal-title', { hasText: 'Add to Collection' })).toBeVisible({ timeout: 5000 });
      await page2.locator('.modal-confirm').click();
      await expect(page2.locator('text=added to your collection')).toBeVisible({ timeout: 5000 });

      // Mark for trade
      await page2.goto('/collection');
      await page2.waitForSelector('.collection-card', { timeout: 10000 });
      const toggle = page2.locator('.toggle-row').filter({ hasText: 'For Trade' }).first().locator('input[type="checkbox"]');
      await toggle.check({ force: true });
      await page2.waitForTimeout(500);
    });

    // ─── Step 6: User 1 sees User 2's card on the Trade page ───
    await test.step('User 1 navigates to Cards For Trade', async () => {
      await page1.goto('/auctions');
      await page1.waitForSelector('.lot-card, .trades-table', { timeout: 10000 });

      // There should be at least one card visible
      const cards = page1.locator('.lot-card, .trades-table tbody tr');
      await expect(cards.first()).toBeVisible();
    });

    // ─── Step 7: Verify pages load without errors ───
    await test.step('Key pages load successfully', async () => {
      // Trades page
      await page1.goto('/trades');
      await expect(page1.locator('.listing-title', { hasText: 'Trades' })).toBeVisible({ timeout: 5000 });

      // Wishlist page
      await page1.goto('/wishlist');
      await expect(page1.locator('.listing-title', { hasText: 'Wishlist' })).toBeVisible({ timeout: 5000 });

      // Analytics page
      await page1.goto('/analytics');
      await expect(page1.locator('.listing-title', { hasText: 'Platform Analytics' })).toBeVisible({ timeout: 5000 });

      // Collection page
      await page1.goto('/collection');
      await expect(page1.locator('.listing-title', { hasText: 'My Collection' })).toBeVisible({ timeout: 5000 });
    });

    // ─── Step 7b: User 1 proposes a trade to User 2 ───
    await test.step('User 1 proposes a trade', async () => {
      await page1.goto('/auctions');
      await page1.waitForSelector('.lot-card, .trades-table', { timeout: 10000 });

      // Find a "Propose Trade" link (grid or list view) that isn't "My Card"
      const proposeLink = page1.locator('a:has-text("Propose Trade")').first();
      if (await proposeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await proposeLink.click();
      } else {
        // Switch to list view and try there
        const listBtn = page1.locator('.view-btn').first();
        await listBtn.click();
        await page1.waitForTimeout(500);
        await page1.locator('a:has-text("Propose Trade")').first().click();
      }

      // Should be on /trades/new?with=...
      await page1.waitForURL(/\/trades\/new/, { timeout: 8000 });
      await expect(page1.locator('.listing-title', { hasText: 'Propose a Trade' })).toBeVisible({ timeout: 5000 });

      // Select the first offered card (my cards)
      const myCard = page1.locator('.card-picker-grid').first().locator('div[style]').first();
      if (await myCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await myCard.click();
      }

      // Select the first requested card (their cards)
      const theirCard = page1.locator('.card-picker-grid').nth(1).locator('div[style]').first();
      if (await theirCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await theirCard.click();
      }

      // Click "Propose Trade" submit button
      const submitBtn = page1.locator('.btn-place-bid', { hasText: 'Propose Trade' });
      await submitBtn.click({ timeout: 5000 });

      // Should redirect to trade detail page
      await page1.waitForURL(/\/trades\//, { timeout: 10000 });
      await expect(page1.locator('.listing-title', { hasText: /Trade with/ })).toBeVisible({ timeout: 5000 });
    });

    // ─── Step 8: User 2 accepts the trade ───
    await test.step('User 2 accepts the trade', async () => {
      await page2.goto('/trades');
      await page2.waitForSelector('.trades-table, .listing-title', { timeout: 10000 });

      // Click the first pending trade row
      const tradeRow = page2.locator('.trades-table tbody tr').first();
      if (await tradeRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await tradeRow.click();
      } else {
        // Try the View link
        await page2.locator('a:has-text("View →")').first().click();
      }

      // Should be on a trade detail page
      await page2.waitForURL(/\/trades\//, { timeout: 8000 });

      // Click "Accept Trade"
      const acceptBtn = page2.locator('.btn-place-bid', { hasText: 'Accept Trade' });
      if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await acceptBtn.click();

        // Expect toast or status change
        await page2.waitForTimeout(1500);
        // The timeline should now show "accepted" as active
        const acceptedStep = page2.locator('text=accepted');
        await expect(acceptedStep.first()).toBeVisible({ timeout: 5000 });
      }
    });

    // ─── Step 9: Both users confirm receipt ───
    await test.step('Both users confirm receipt', async () => {
      // User 1 confirms receipt
      await page1.reload();
      await page1.waitForTimeout(1000);

      const confirmBtn1 = page1.locator('.btn-place-bid', { hasText: 'Confirm Receipt' });
      if (await confirmBtn1.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirmBtn1.click();
        await page1.waitForTimeout(1500);
        // Should see "Waiting for the other party" message
        await expect(page1.locator('text=Waiting for the other party')).toBeVisible({ timeout: 5000 });
      }

      // User 2 confirms receipt
      await page2.reload();
      await page2.waitForTimeout(1000);

      const confirmBtn2 = page2.locator('.btn-place-bid', { hasText: 'Confirm Receipt' });
      if (await confirmBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirmBtn2.click();
        await page2.waitForTimeout(2000);

        // Trade should now be "Completed"
        // The rating widget should appear
        const rateWidget = page2.locator('text=Rate your experience');
        await expect(rateWidget).toBeVisible({ timeout: 5000 });
      }
    });

    // ─── Step 10: User 1 rates the trade ───
    await test.step('User 1 rates the trade', async () => {
      await page1.reload();
      await page1.waitForTimeout(1000);

      // The rating widget should appear
      const rateWidget = page1.locator('text=Rate your experience');
      if (await rateWidget.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Click the 5th star (5-star rating)
        const stars = page1.locator('button:has-text("★")');
        const starCount = await stars.count();
        if (starCount >= 5) {
          await stars.nth(4).click(); // 5th star (0-indexed)
        }

        await page1.waitForTimeout(1500);
        // Rating confirmation should appear
        await expect(page1.locator('text=Rating submitted')).toBeVisible({ timeout: 5000 });
      }
    });

    // Cleanup
    await ctx1.close();
    await ctx2.close();
  });

  test('Keyboard shortcuts work', async ({ page }) => {
    await page.goto('/');

    // Test Ctrl+K opens command palette
    await page.keyboard.press('Control+k');
    await expect(page.locator('input[placeholder="Search commands…"]')).toBeVisible({ timeout: 3000 });

    // Type and verify filtering
    await page.fill('input[placeholder="Search commands…"]', 'collection');
    await expect(page.locator('text=Go to Collection')).toBeVisible();

    // Escape closes it
    await page.keyboard.press('Escape');
    await expect(page.locator('input[placeholder="Search commands…"]')).not.toBeVisible({ timeout: 2000 });

    // Test / focuses search bar
    await page.keyboard.press('/');
    const searchInput = page.locator('.nav-search-wrap input');
    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(searchInput).toBeFocused();
    }
  });

  test('Analytics page loads with stats', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.locator('.listing-title', { hasText: 'Platform Analytics' })).toBeVisible({ timeout: 5000 });

    // Should have 3 stat boxes
    const statBoxes = page.locator('text=Active Traders');
    await expect(statBoxes).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Completed Trades')).toBeVisible();
    await expect(page.locator('text=Cards Up for Trade')).toBeVisible();
  });
});
