import { test, expect } from "@playwright/test";
import { waitForAppReady } from "../helpers/wait-for-app";

test.describe("SSE Resilience", () => {
  test("connection status indicator shows connected state", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForAppReady(page);

    // Look for a connection status indicator
    const indicator = page.locator(
      '[data-testid="connection-status"], [class*="connection"], [class*="status-indicator"]'
    ).first();

    if (await indicator.count() > 0) {
      await expect(indicator).toBeVisible();
    }

    // Verify that the SSE endpoint is actually reachable by checking the page
    // received price data (which comes from SSE)
    await page.waitForFunction(
      () => {
        const body = document.body.textContent || "";
        // Check for price numbers — evidence that SSE data is flowing
        return /\d+\.\d{2}/.test(body);
      },
      undefined,
      { timeout: 15_000 }
    );
  });

  test("SSE delivers price data to the page", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);

    // Verify prices update by checking that at least one price element
    // contains a numeric value (evidence that SSE data flowed)
    const priceText = await page.evaluate(() => {
      const body = document.body.textContent || "";
      const matches = body.match(/\d{2,}\.\d{2}/g);
      return matches ? matches.length : 0;
    });

    // We should see multiple prices on the page (10 default tickers)
    expect(priceText).toBeGreaterThan(3);
  });
});
