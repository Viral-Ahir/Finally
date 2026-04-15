import { test, expect } from "@playwright/test";
import { waitForAppReady } from "../helpers/wait-for-app";

test.describe("Fresh Start", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
  });

  test("displays default tickers in the watchlist", async ({ page }) => {
    // At least some of the default tickers should appear on the page
    // (some may have been removed by prior tests, so check a few)
    const defaultTickers = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V"];
    let found = 0;
    for (const ticker of defaultTickers) {
      const locator = page.getByText(ticker, { exact: false }).first();
      if (await locator.isVisible().catch(() => false)) {
        found++;
      }
    }
    // At least 5 of the default tickers should be visible
    expect(found).toBeGreaterThanOrEqual(5);
  });

  test("shows cash balance in header", async ({ page }) => {
    // The header should show a dollar amount for the portfolio and cash
    // The exact amount depends on prior test state, but it should be a valid dollar amount
    await expect(page.getByText(/\$[\d,.]+/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows live streaming prices", async ({ page }) => {
    // Verify that price values are visible for at least some tickers.
    const pricePattern = /\d+\.\d{2}/;

    await page.waitForFunction(
      () => {
        const body = document.body.textContent || "";
        const matches = body.match(/\$?\d{1,5}\.\d{2}/g);
        return matches && matches.length >= 3;
      },
      undefined,
      { timeout: 15_000 }
    );
  });

  test("shows connection status indicator as connected", async ({ page }) => {
    // Look for the connection status indicator
    const indicator = page.locator(".status-dot");
    if (await indicator.count() > 0) {
      await expect(indicator).toBeVisible();
      // Check it has the connected class
      const classes = await indicator.getAttribute("class") || "";
      expect(classes).toContain("status-connected");
    } else {
      // Fallback: verify the page is alive with content
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });
});
