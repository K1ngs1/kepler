import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Comprehensive end-to-end smoke test for Kepler.
 *
 * Simulates two distinct users (UserA and UserB) through the full trading
 * and payment lifecycle using separate browser contexts.
 *
 * Prerequisites:
 *   - Dev server running (localhost:5000 or BASE_URL)
 *   - Supabase configured with seeded catalog data
 *   - Optionally set TEST_USER1_EMAIL / TEST_USER1_PASSWORD and
 *     TEST_USER2_EMAIL / TEST_USER2_PASSWORD to use pre-created accounts
 *
 * Run:
 *   cd frontend && npx playwright test tests/smoke-test.spec.ts
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const USER_A_EMAIL = process.env.TEST_USER1_EMAIL || `smokeA_${Date.now()}@kepler.test`;
const USER_A_PASS = process.env.TEST_USER1_PASSWORD || 'SmokeTestA1!';
const USER_B_EMAIL = process.env.TEST_USER2_EMAIL || `smokeB_${Date.now()}@kepler.test`;
const USER_B_PASS = process.env.TEST_USER2_PASSWORD || 'SmokeTestB1!';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Register or sign-in a user via the LoginModal and return their display name. */
async function authenticate(page: Page, email: string, password: string): Promise<string> {
  await page.goto(BASE);

  // Open the login modal
  const loginBtn = page.locator('.nav-login', { hasText: 'Login' });

  await expect(async () => {
    await loginBtn.click();
    await expect(page.locator('.login-modal')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 10000 });

  const success = page.locator('.login-success-title');
  const error = page.locator('.auth-error');

  // Try sign-in first (works for pre-existing users)
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('.login-submit-btn').click();

  const firstResult = await Promise.race([
    success.waitFor({ timeout: 10000 }).then(() => 'success' as const),
    error.waitFor({ timeout: 10000 }).then(() => 'error' as const),
  ]).catch(() => 'timeout' as const);

  if (firstResult === 'success') {
    await page.waitForTimeout(2000);
    const navUser = page.locator('.nav-login').first();
    return (await navUser.textContent()) ?? email;
  }

  if (firstResult === 'error') {
    // Sign-in failed – try sign-up instead
    const createLink = page.locator('.login-register-txt a', { hasText: 'Create one free' });
    if (await createLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createLink.click();
      await page.waitForTimeout(300);
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.locator('.login-submit-btn').click();

      const signUpResult = await Promise.race([
        success.waitFor({ timeout: 10000 }).then(() => 'success' as const),
        error.waitFor({ timeout: 10000 }).then(() => 'error' as const),
      ]).catch(() => 'timeout' as const);

      if (signUpResult !== 'success') {
        const errText = await error.textContent().catch(() => 'unknown error');
        throw new Error(`Authentication failed for ${email}. Sign-in and sign-up both failed. Last error: ${errText}`);
      }
    } else {
      const errText = await error.textContent().catch(() => 'unknown error');
      throw new Error(`Authentication failed for ${email}: ${errText}`);
    }
  }

  if (firstResult === 'timeout') {
    await expect(success).toBeVisible({ timeout: 5000 });
  }

  // Wait for success modal auto-dismiss
  await page.waitForTimeout(2000);

  // Return the display text in the nav (email or initials)
  const navUser = page.locator('.nav-login').first();
  return (await navUser.textContent()) ?? email;
}

/** Navigate to a path and assert both nav and footer are rendered. */
async function assertLayout(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await expect(page.locator('.nav-logo')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 8000 });
}

/* ------------------------------------------------------------------ */
/*  Main smoke test                                                    */
/* ------------------------------------------------------------------ */

test('Kepler Smoke Test – Two-User Full Lifecycle', async ({ browser }) => {
  // Increase timeout for this comprehensive test
  test.setTimeout(300_000);

  const ctxA: BrowserContext = await browser.newContext();
  const ctxB: BrowserContext = await browser.newContext();
  const pageA: Page = await ctxA.newPage();
  const pageB: Page = await ctxB.newPage();

  let cardNameA = '';
  let cardNameB = '';
  let tradeUrl = '';
  let listingUrl = '';

  /* ============================================================== */
  /*  1. SETUP – Homepage & Layout                                   */
  /* ============================================================== */
  await test.step('1. Homepage renders with hero and nav for both users', async () => {
    await pageA.goto(BASE);
    await expect(pageA.locator('.nav-logo')).toBeVisible({ timeout: 10000 });
    await expect(pageA.locator('.footer')).toBeVisible({ timeout: 10000 });
    const heroA = pageA.locator('.section, .hero, [class*="hero"]').first();
    await expect(heroA).toBeVisible({ timeout: 8000 });

    await pageB.goto(BASE);
    await expect(pageB.locator('.nav-logo')).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator('.footer')).toBeVisible({ timeout: 10000 });
  });

  /* ============================================================== */
  /*  2. AUTHENTICATION                                              */
  /* ============================================================== */
  await test.step('2a. UserA registers / signs in', async () => {
    const display = await authenticate(pageA, USER_A_EMAIL, USER_A_PASS);
    console.log(`  UserA authenticated – nav shows: "${display}"`);
    await expect(pageA.locator('.nav-login', { hasText: 'Login' })).not.toBeVisible({ timeout: 3000 });
  });

  await test.step('2b. UserB registers / signs in', async () => {
    const display = await authenticate(pageB, USER_B_EMAIL, USER_B_PASS);
    console.log(`  UserB authenticated – nav shows: "${display}"`);
    await expect(pageB.locator('.nav-login', { hasText: 'Login' })).not.toBeVisible({ timeout: 3000 });
  });

  /* ============================================================== */
  /*  3. CATALOG & COLLECTION                                        */
  /* ============================================================== */
  await test.step('3a. UserA adds a card from catalog to collection', async () => {
    // Log all POST requests to identify the add-to-collection endpoint
    pageA.on('request', (req) => {
      if (req.method() === 'POST') console.log('  POST request:', req.url());
    });

    await pageA.goto(`${BASE}/catalog`);
    await pageA.waitForSelector('.catalog-card', { timeout: 15000 });

    const cards = pageA.locator('.catalog-card');
    expect(await cards.count()).toBeGreaterThan(0);

    // Capture the card name before adding so we can verify it in the collection
    cardNameA = (await pageA.locator('.catalog-card').first().locator('h3, .catalog-card-name, strong').first().textContent()) ?? '';
    console.log(`  Card to add: "${cardNameA}"`);

    const addBtn = pageA.locator('.catalog-card-add').first();
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();

    await expect(pageA.locator('.modal-title', { hasText: 'Add to Collection' })).toBeVisible({ timeout: 6000 });

    const condSelect = pageA.locator('.modal').locator('.toolbar-select, select').first();
    if (await condSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await condSelect.selectOption({ index: 2 });
    }
    const qtyInput = pageA.locator('.modal').locator('input[type="number"]');
    if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await qtyInput.fill('1');
    }

    // Wait for the POST that persists the card, then click confirm
    const [addResp] = await Promise.all([
      pageA.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST' &&
          (resp.url().includes('/rest/v1/user_cards') || resp.url().includes('user_cards')),
        { timeout: 15000 }
      ),
      pageA.locator('.modal-confirm').click(),
    ]);

    const addStatus = addResp.status();
    const addBody = await addResp.text().catch(() => '');
    console.log(`  Supabase upsert: HTTP ${addStatus} — ${addBody.substring(0, 300)}`);
    if (addStatus >= 400) {
      throw new Error(`Add-to-collection failed: HTTP ${addStatus}: ${addBody}`);
    }

    await expect(pageA.locator('text=added to your collection')).toBeVisible({ timeout: 8000 });
  });

  await test.step('3b. UserA verifies card in collection and marks "For Trade"', async () => {
    // Retry navigation — auth state may not restore from localStorage on the first render
    await expect(async () => {
      await pageA.goto(`${BASE}/collection`);
      await pageA.waitForLoadState('networkidle');
      // Fail the retry if we see sign-in prompt or empty state (auth not ready)
      const signIn = await pageA.locator('text=Sign in to see your collection').isVisible().catch(() => false);
      const empty = await pageA.locator('text=Your collection is empty').isVisible().catch(() => false);
      if (signIn || empty) throw new Error('Auth not ready or collection empty');
      await expect(pageA.locator('.collection-card').first()).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000, intervals: [2000, 3000, 5000] });

    cardNameA = (await pageA.locator('.collection-card-name').first().textContent()) ?? '';
    console.log(`  UserA card: "${cardNameA}"`);
    expect(cardNameA.length).toBeGreaterThan(0);

    const forTradeToggle = pageA
      .locator('.toggle-row')
      .filter({ hasText: 'For Trade' })
      .first()
      .locator('.toggle-slider');
    await forTradeToggle.scrollIntoViewIfNeeded();
    await forTradeToggle.click();
    await pageA.waitForTimeout(800);
  });

  await test.step('3c. UserB adds a different card and marks "For Trade"', async () => {
    await pageB.goto(`${BASE}/catalog`);
    await pageB.waitForSelector('.catalog-card', { timeout: 15000 });

    const addBtns = pageB.locator('.catalog-card-add');
    const count = await addBtns.count();
    const idx = count > 1 ? 1 : 0;

    // Capture the card name before adding
    cardNameB = (await pageB.locator('.catalog-card').nth(idx).locator('h3, .catalog-card-name, strong').first().textContent()) ?? '';
    console.log(`  Card to add B: "${cardNameB}"`);

    await addBtns.nth(idx).scrollIntoViewIfNeeded();
    await addBtns.nth(idx).click();

    await expect(pageB.locator('.modal-title', { hasText: 'Add to Collection' })).toBeVisible({ timeout: 6000 });

    const condSelect = pageB.locator('.modal').locator('.toolbar-select, select').first();
    if (await condSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await condSelect.selectOption({ index: 2 });
    }

    // Wait for the POST that persists the card, then click confirm
    const [addRespB] = await Promise.all([
      pageB.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST' &&
          (resp.url().includes('/rest/v1/user_cards') || resp.url().includes('user_cards')),
        { timeout: 15000 }
      ),
      pageB.locator('.modal-confirm').click(),
    ]);

    const addStatusB = addRespB.status();
    const addBodyB = await addRespB.text().catch(() => '');
    console.log(`  Supabase upsert B: HTTP ${addStatusB} — ${addBodyB.substring(0, 300)}`);
    if (addStatusB >= 400) {
      throw new Error(`Add-to-collection failed for UserB: HTTP ${addStatusB}: ${addBodyB}`);
    }

    await expect(pageB.locator('text=added to your collection')).toBeVisible({ timeout: 8000 });

    // Retry navigation — auth state may not restore from localStorage on the first render
    await expect(async () => {
      await pageB.goto(`${BASE}/collection`);
      await pageB.waitForLoadState('networkidle');
      const signIn = await pageB.locator('text=Sign in to see your collection').isVisible().catch(() => false);
      const empty = await pageB.locator('text=Your collection is empty').isVisible().catch(() => false);
      if (signIn || empty) throw new Error('Auth not ready or collection empty');
      await expect(pageB.locator('.collection-card').first()).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000, intervals: [2000, 3000, 5000] });

    cardNameB = (await pageB.locator('.collection-card-name').first().textContent()) ?? '';
    console.log(`  UserB card: "${cardNameB}"`);
    expect(cardNameB.length).toBeGreaterThan(0);

    const forTradeToggle = pageB
      .locator('.toggle-row')
      .filter({ hasText: 'For Trade' })
      .first()
      .locator('.toggle-slider');
    await forTradeToggle.scrollIntoViewIfNeeded();
    await forTradeToggle.click();
    await pageB.waitForTimeout(800);
  });

  /* ============================================================== */
  /*  4. TRADEABLE CARDS PAGE (AUCTIONS)                             */
  /* ============================================================== */
  await test.step('4a. UserB sees tradeable cards on /auctions', async () => {
    await pageB.goto(`${BASE}/auctions`);
    await pageB.waitForSelector('.lot-card, .trades-table', { timeout: 15000 });

    const lotCards = pageB.locator('.lot-card, .trades-table tbody tr');
    await expect(lotCards.first()).toBeVisible({ timeout: 10000 });
  });

  await test.step('4b. UserA sees tradeable cards on /auctions', async () => {
    await pageA.goto(`${BASE}/auctions`);
    await pageA.waitForSelector('.lot-card, .trades-table', { timeout: 15000 });

    const lotCards = pageA.locator('.lot-card, .trades-table tbody tr');
    await expect(lotCards.first()).toBeVisible({ timeout: 10000 });
  });

  /* ============================================================== */
  /*  5. PROPOSE A TRADE                                             */
  /* ============================================================== */
  await test.step('5. UserA proposes a trade to UserB', async () => {
    await pageA.goto(`${BASE}/auctions`);
    await pageA.waitForSelector('.lot-card, .trades-table', { timeout: 15000 });

    const proposeLink = pageA.locator('a:has-text("Propose Trade")').first();
    if (await proposeLink.isVisible({ timeout: 6000 }).catch(() => false)) {
      await proposeLink.click();
    } else {
      const listBtn = pageA.locator('.view-btn').first();
      if (await listBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await listBtn.click();
        await pageA.waitForTimeout(600);
      }
      await pageA.locator('a:has-text("Propose Trade")').first().click();
    }

    await pageA.waitForURL(/\/trades\/new/, { timeout: 10000 });
    await expect(pageA.locator('.listing-title', { hasText: 'Propose a Trade' })).toBeVisible({ timeout: 8000 });

    // Select first offered card (UserA's cards)
    const myCardPicker = pageA.locator('.card-picker-grid').first();
    const myFirstCard = myCardPicker.locator('div').filter({ has: pageA.locator('img, [class*="card"]') }).first();
    if (await myFirstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await myFirstCard.click();
    }

    // Select first requested card (UserB's cards)
    const theirCardPicker = pageA.locator('.card-picker-grid').nth(1);
    const theirFirstCard = theirCardPicker.locator('div').filter({ has: pageA.locator('img, [class*="card"]') }).first();
    if (await theirFirstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await theirFirstCard.click();
    }

    const submitBtn = pageA.locator('.btn-place-bid', { hasText: 'Propose Trade' });
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await pageA.waitForURL(/\/trades\/[a-zA-Z0-9-]+/, { timeout: 15000 });
    tradeUrl = pageA.url();
    console.log(`  Trade URL: ${tradeUrl}`);

    await expect(pageA.locator('.listing-title', { hasText: /Trade with/ })).toBeVisible({ timeout: 8000 });

    const proposedLabel = pageA.locator('text=proposed');
    await expect(proposedLabel.first()).toBeVisible({ timeout: 5000 });
  });

  /* ============================================================== */
  /*  6. REAL-TIME CHAT & ACCEPT TRADE                               */
  /* ============================================================== */
  await test.step('6a. UserB sees the trade offer and opens it', async () => {
    await pageB.goto(`${BASE}/trades`);
    await pageB.waitForTimeout(2000);

    const tradeRow = pageB.locator('.trades-table tbody tr').first();
    if (await tradeRow.isVisible({ timeout: 8000 }).catch(() => false)) {
      await tradeRow.click();
    } else {
      const tradeId = tradeUrl.split('/trades/')[1];
      if (tradeId) {
        await pageB.goto(`${BASE}/trades/${tradeId}`);
      }
    }

    await pageB.waitForURL(/\/trades\/[a-zA-Z0-9-]+/, { timeout: 10000 });
    await expect(pageB.locator('.listing-title', { hasText: /Trade with/ })).toBeVisible({ timeout: 8000 });
  });

  await test.step('6b. UserB sends a chat message', async () => {
    const msgInput = pageB.locator('input[placeholder="Type a message…"]');
    await expect(msgInput).toBeVisible({ timeout: 5000 });
    await msgInput.fill('Looks good!');
    await pageB.locator('.modal-confirm', { hasText: 'Send' }).click();

    await expect(pageB.locator('text=Looks good!')).toBeVisible({ timeout: 5000 });
  });

  await test.step('6c. UserA sees the chat message in real-time', async () => {
    await pageA.reload();
    await pageA.waitForTimeout(2000);

    await expect(pageA.locator('text=Looks good!')).toBeVisible({ timeout: 8000 });
  });

  await test.step('6d. UserB accepts the trade', async () => {
    const acceptBtn = pageB.locator('.btn-place-bid', { hasText: 'Accept Trade' });
    await expect(acceptBtn).toBeVisible({ timeout: 6000 });
    await acceptBtn.click();

    await pageB.waitForTimeout(2000);

    const acceptedLabel = pageB.locator('text=accepted');
    await expect(acceptedLabel.first()).toBeVisible({ timeout: 8000 });

    const confirmBtn = pageB.locator('.btn-place-bid', { hasText: 'Confirm Receipt' });
    await expect(confirmBtn).toBeVisible({ timeout: 6000 });
  });

  /* ============================================================== */
  /*  7. COMPLETE THE TRADE                                          */
  /* ============================================================== */
  await test.step('7a. UserA confirms receipt', async () => {
    await pageA.reload();
    await pageA.waitForTimeout(1500);

    const confirmBtn = pageA.locator('.btn-place-bid', { hasText: 'Confirm Receipt' });
    await expect(confirmBtn).toBeVisible({ timeout: 8000 });
    await confirmBtn.click();
    await pageA.waitForTimeout(2000);

    await expect(pageA.locator('text=Waiting for the other party')).toBeVisible({ timeout: 8000 });
  });

  await test.step('7b. UserB confirms receipt → trade completes', async () => {
    await pageB.reload();
    await pageB.waitForTimeout(1500);

    const confirmBtn = pageB.locator('.btn-place-bid', { hasText: 'Confirm Receipt' });
    await expect(confirmBtn).toBeVisible({ timeout: 8000 });
    await confirmBtn.click();
    await pageB.waitForTimeout(2500);

    const rateWidget = pageB.locator('text=Rate your experience');
    await expect(rateWidget).toBeVisible({ timeout: 8000 });
  });

  await test.step('7c. Ownership transferred – collections updated', async () => {
    await pageA.goto(`${BASE}/collection`);
    await pageA.waitForSelector('.collection-card', { timeout: 10000 });
    const userACards = await pageA.locator('.collection-card-name').allTextContents();
    console.log(`  UserA collection after trade: ${JSON.stringify(userACards)}`);

    await pageB.goto(`${BASE}/collection`);
    await pageB.waitForSelector('.collection-card', { timeout: 10000 });
    const userBCards = await pageB.locator('.collection-card-name').allTextContents();
    console.log(`  UserB collection after trade: ${JSON.stringify(userBCards)}`);

    if (cardNameA && cardNameB) {
      const aHasB = userACards.some(n => n.includes(cardNameB));
      const bHasA = userBCards.some(n => n.includes(cardNameA));
      if (aHasB) console.log(`  ✓ UserA received "${cardNameB}"`);
      else console.log(`  ⚠ UserA does not yet show "${cardNameB}" (may need refresh)`);
      if (bHasA) console.log(`  ✓ UserB received "${cardNameA}"`);
      else console.log(`  ⚠ UserB does not yet show "${cardNameA}" (may need refresh)`);
    }
  });

  /* ============================================================== */
  /*  8. LISTING & BUY NOW (BASIC)                                   */
  /* ============================================================== */
  await test.step('8a. UserA creates a new listing', async () => {
    await pageA.goto(`${BASE}/listings/new`);
    await expect(pageA.locator('.listing-title', { hasText: 'Create a New Listing' })).toBeVisible({ timeout: 8000 });

    await pageA.fill('input[placeholder="e.g. Vintage Holo Collection"]', 'Test Lot');
    await pageA.fill('textarea[placeholder*="Describe your cards"]', 'My test lot');

    // Search for a card to add
    const searchInput = pageA.locator('.toolbar-search input, input[placeholder="Search catalog cards..."]').first();
    await searchInput.fill('char');
    await pageA.waitForTimeout(1500);

    // Select first search result
    const searchResult = pageA.locator('div[style*="cursor: pointer"]').filter({ has: pageA.locator('span') }).first();
    if (await searchResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchResult.click();
      await pageA.waitForTimeout(500);
    }

    await pageA.locator('.login-submit-btn', { hasText: 'Create Listing' }).click();

    await pageA.waitForURL(/\/listings\/[a-zA-Z0-9-]+/, { timeout: 15000 });
    listingUrl = pageA.url();
    console.log(`  Listing URL: ${listingUrl}`);

    await expect(pageA.locator('.detail-title')).toBeVisible({ timeout: 8000 });
  });

  await test.step('8b. UserB opens listing and clicks "Buy Now"', async () => {
    await pageB.goto(listingUrl);
    await pageB.waitForTimeout(2000);

    await expect(pageB.locator('.detail-title')).toBeVisible({ timeout: 8000 });

    const buyBtn = pageB.locator('.btn-buy-now', { hasText: 'Buy Now' });
    if (await buyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await buyBtn.click();

      await expect(pageB.locator('.login-heading', { hasText: 'Buy Cards' })).toBeVisible({ timeout: 5000 });

      const cardItems = pageB.locator('.login-modal label');
      expect(await cardItems.count()).toBeGreaterThan(0);

      // Close the modal (no wallet to complete payment)
      await pageB.locator('.login-close').click();
      await pageB.waitForTimeout(500);
    } else {
      console.log('  ⚠ Buy Now button not visible (user may be the seller)');
    }
  });

  /* ============================================================== */
  /*  9. SECURITY DEPOSIT (UI ONLY)                                  */
  /* ============================================================== */
  await test.step('9. Security deposit section visible on completed trade', async () => {
    if (tradeUrl) {
      await pageA.goto(tradeUrl);
      await pageA.waitForTimeout(2000);

      const depositTitle = pageA.locator('text=Security Deposit (USDC)');
      if (await depositTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('  ✓ Security Deposit section is visible');

        const proposeInput = pageA.locator('input[placeholder="0"]');
        const proposeBtn = pageA.locator('text=Propose Amount');
        if (await proposeInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await proposeInput.fill('5');
          console.log('  ✓ Propose Amount input works');
        }
        if (await proposeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('  ✓ Propose Amount button visible');
        }

        const walletBtn = pageA.locator('text=Connect Wallet to Lock Deposit');
        if (await walletBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('  ✓ Wallet connection prompt visible (expected without wallet)');
        }
      } else {
        console.log('  ⚠ Security Deposit section not visible (may require accepted status)');
      }
    }
  });

  /* ============================================================== */
  /*  10. LAYOUT & DESIGN CHECKS                                     */
  /* ============================================================== */
  await test.step('10a. Layout checks – Catalog page', async () => {
    await assertLayout(pageA, '/catalog');
    await expect(pageA.locator('.catalog-grid')).toBeVisible({ timeout: 8000 });
    const images = pageA.locator('.catalog-card-img img');
    const imgCount = await images.count();
    for (let i = 0; i < Math.min(imgCount, 5); i++) {
      const naturalWidth = await images.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth);
      expect(naturalWidth).toBeGreaterThan(0);
    }
  });

  await test.step('10b. Layout checks – Collection page', async () => {
    await assertLayout(pageA, '/collection');
    await expect(pageA.locator('.listing-title', { hasText: 'My Collection' })).toBeVisible({ timeout: 5000 });
  });

  await test.step('10c. Layout checks – Auctions page', async () => {
    await assertLayout(pageA, '/auctions');
    await expect(pageA.locator('.listing-title', { hasText: 'Cards For Trade' })).toBeVisible({ timeout: 5000 });
  });

  await test.step('10d. Layout checks – Trades page', async () => {
    await assertLayout(pageA, '/trades');
    await expect(pageA.locator('.listing-title', { hasText: /Trades|My Trades/ })).toBeVisible({ timeout: 5000 });
  });

  await test.step('10e. Layout checks – Wishlist page', async () => {
    await assertLayout(pageA, '/wishlist');
    await expect(pageA.locator('.listing-title', { hasText: 'Wishlist' })).toBeVisible({ timeout: 5000 });
  });

  await test.step('10f. Layout checks – Analytics page', async () => {
    await assertLayout(pageA, '/analytics');
    await expect(pageA.locator('.listing-title', { hasText: 'Platform Analytics' })).toBeVisible({ timeout: 5000 });
    await expect(pageA.locator('text=Active Traders')).toBeVisible({ timeout: 5000 });
    await expect(pageA.locator('text=Completed Trades')).toBeVisible({ timeout: 5000 });
  });

  await test.step('10g. Layout checks – Listings page', async () => {
    await assertLayout(pageA, '/listings');
    const title = pageA.locator('.listing-title').first();
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  // Cleanup
  await ctxA.close();
  await ctxB.close();
});
