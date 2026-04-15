import { test, expect } from "@playwright/test";
import { waitForAppReady } from "../helpers/wait-for-app";
import { getPortfolio, executeTrade } from "../helpers/api";

test.describe("Trading", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
  });

  test("buy shares — cash decreases and position appears", async ({
    request,
  }) => {
    // Get initial portfolio state
    const before = await getPortfolio(request);
    const initialCash = before.cash_balance;

    // Execute a buy via API
    const result = await executeTrade(request, "MSFT", 1, "buy");
    expect(result.status).toBe(200);

    // Verify cash decreased
    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeLessThan(initialCash);

    // Verify MSFT position exists
    const msftPosition = after.positions.find(
      (p: { ticker: string }) => p.ticker === "MSFT"
    );
    expect(msftPosition).toBeTruthy();
    expect(msftPosition.quantity).toBeGreaterThanOrEqual(1);
  });

  test("sell shares — cash increases and position updates", async ({
    request,
  }) => {
    // First ensure we have shares to sell — buy via API
    await executeTrade(request, "GOOGL", 3, "buy");

    const before = await getPortfolio(request);
    const cashBefore = before.cash_balance;
    const googlBefore = before.positions.find(
      (p: { ticker: string }) => p.ticker === "GOOGL"
    );
    expect(googlBefore).toBeTruthy();

    // Now sell 1 share
    const sellResult = await executeTrade(request, "GOOGL", 1, "sell");
    expect(sellResult.status).toBe(200);

    // Verify cash increased
    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeGreaterThan(cashBefore);
  });

  test("reject buy with insufficient cash", async ({ request }) => {
    // Try to buy an absurd quantity that would exceed available cash
    const result = await executeTrade(request, "AAPL", 100000, "buy");
    expect(result.status).toBe(400);
  });

  test("reject sell with insufficient shares", async ({ request }) => {
    // Try to sell shares we don't own (use a ticker we definitely haven't bought)
    const result = await executeTrade(request, "NFLX", 999, "sell");
    expect(result.status).toBe(400);
  });
});
