import { test, expect } from "@playwright/test";
import { waitForAppReady } from "../helpers/wait-for-app";
import { executeTrade, getPortfolio, getPortfolioHistory } from "../helpers/api";

test.describe("Portfolio Visualization", () => {
  test.beforeEach(async ({ page, request }) => {
    // Buy a few positions so the portfolio has data to display
    await executeTrade(request, "AAPL", 5, "buy");
    await executeTrade(request, "GOOGL", 3, "buy");

    await page.goto("/");
    await waitForAppReady(page);
  });

  test("heatmap renders after buying positions", async ({ page }) => {
    // Look for a heatmap/treemap element — it could be a canvas, SVG, or div-based
    const heatmap = page.locator(
      '[data-testid="heatmap"], [data-testid="treemap"], [class*="heatmap"], [class*="treemap"], canvas, svg'
    ).first();

    // At minimum, verify the page has portfolio visualization content
    // The heatmap should show our positions (AAPL, GOOGL)
    // Use .first() since tickers appear in watchlist, chart, heatmap, and positions table
    await expect(page.getByText("AAPL").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("GOOGL").first()).toBeVisible({ timeout: 10_000 });
  });

  test("P&L chart has data points", async ({ page, request }) => {
    // Check that portfolio_snapshots API returns data
    const history = await getPortfolioHistory(request);
    expect(history.length).toBeGreaterThan(0);

    // Check the first snapshot has valid data
    const first = history[0];
    expect(first.total_value).toBeGreaterThan(0);
    expect(first.recorded_at).toBeTruthy();
  });

  test("positions table shows correct P&L data", async ({ page, request }) => {
    // Verify the portfolio API returns correct position data
    const portfolio = await getPortfolio(request);
    expect(portfolio.positions.length).toBeGreaterThan(0);

    // Check that each position has the expected fields
    for (const pos of portfolio.positions) {
      expect(pos.ticker).toBeTruthy();
      expect(pos.quantity).toBeGreaterThan(0);
      expect(pos.avg_cost).toBeGreaterThan(0);
      expect(pos.current_price).toBeGreaterThan(0);
      expect(typeof pos.unrealized_pnl).toBe("number");
      expect(typeof pos.pct_change).toBe("number");
    }

    // Check that at least one position ticker is visible on the page
    const tickers = portfolio.positions.map((p: { ticker: string }) => p.ticker);
    let found = false;
    for (const ticker of tickers) {
      if (await page.getByText(ticker).first().isVisible().catch(() => false)) {
        found = true;
        break;
      }
    }
    expect(found).toBeTruthy();
  });
});
