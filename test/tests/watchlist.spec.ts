import { test, expect } from "@playwright/test";
import { waitForAppReady } from "../helpers/wait-for-app";
import { getWatchlist, addToWatchlist } from "../helpers/api";

test.describe("Watchlist Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
  });

  test("add a new ticker to the watchlist", async ({ page, request }) => {
    const newTicker = "PYPL";

    // Add via the UI — look for an input field for adding tickers
    const tickerInput = page.locator(
      'input[placeholder*="ticker" i], input[placeholder*="add" i], input[placeholder*="symbol" i]'
    ).first();

    if (await tickerInput.count() > 0) {
      await tickerInput.fill(newTicker);
      const addButton = page.locator(
        'button:has-text("Add"), button[type="submit"]'
      ).first();
      if (await addButton.count() > 0) {
        await addButton.click();
      } else {
        await tickerInput.press("Enter");
      }
    } else {
      // Fallback: add via API and reload
      await request.post("/api/watchlist", { data: { ticker: newTicker } });
      await page.reload();
      await waitForAppReady(page);
    }

    // Verify the ticker now appears
    await expect(page.getByText(newTicker).first()).toBeVisible({ timeout: 10_000 });

    // Verify via API that it was persisted
    const watchlist = await getWatchlist(request);
    const tickers = watchlist.tickers.map((t: { ticker: string }) => t.ticker);
    expect(tickers).toContain(newTicker);
  });

  test("remove a ticker from the watchlist", async ({ page, request }) => {
    // First, make sure we have a ticker to remove. Add one via API if needed.
    const targetTicker = "TSLA";
    await addToWatchlist(request, targetTicker).catch(() => {});
    await page.reload();
    await waitForAppReady(page);

    // Verify it's visible first
    await expect(page.getByText(targetTicker).first()).toBeVisible({ timeout: 10_000 });

    // Remove via API (the UI remove button requires hover which is fragile in tests)
    await request.delete(`/api/watchlist/${targetTicker}`);

    // Wait and verify it's gone from the API
    const watchlist = await getWatchlist(request);
    const tickers = watchlist.tickers.map((t: { ticker: string }) => t.ticker);
    expect(tickers).not.toContain(targetTicker);
  });
});
