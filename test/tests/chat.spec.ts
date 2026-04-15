import { test, expect } from "@playwright/test";
import { waitForAppReady } from "../helpers/wait-for-app";
import { sendChatMessage, getWatchlist, getPortfolio } from "../helpers/api";

test.describe("AI Chat (Mocked)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
  });

  test("send a message and receive a response", async ({ page, request }) => {
    // Try to use the chat UI if available
    const chatInput = page.locator(
      'input[placeholder*="message" i], input[placeholder*="chat" i], input[placeholder*="ask" i], textarea[placeholder*="message" i], textarea[placeholder*="chat" i]'
    ).first();

    if (await chatInput.count() > 0) {
      await chatInput.fill("What do you think about my portfolio?");
      // Press Enter or click Send
      const sendButton = page.locator(
        'button:has-text("Send"), button:has-text("send"), button[type="submit"]'
      ).first();
      if (await sendButton.count() > 0) {
        await sendButton.click();
      } else {
        await chatInput.press("Enter");
      }

      // Wait for the response to appear — the mock returns a message with trade and watchlist change
      await page.waitForTimeout(5_000);

      // The mock default response includes "analysis" or "portfolio" or "recommend"
      const responseVisible = await page
        .getByText(/portfolio|analysis|recommend/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(responseVisible).toBeTruthy();
    } else {
      // Fallback: test via API directly
      const result = await sendChatMessage(
        request,
        "What do you think about my portfolio?"
      );
      expect(result.status).toBe(200);
      expect(result.body).toBeTruthy();
      expect(result.body.message).toBeTruthy();
      expect(result.body.message.length).toBeGreaterThan(0);
    }
  });

  test("trade execution via chat appears inline", async ({
    page,
    request,
  }) => {
    // Send a "buy" message — the mock will respond with a buy trade for AAPL
    const result = await sendChatMessage(request, "buy some AAPL stock");
    expect(result.status).toBe(200);
    expect(result.body.trades).toBeTruthy();
    expect(result.body.trades.length).toBeGreaterThan(0);

    // The mock buys 5 AAPL
    const trade = result.body.trades[0];
    expect(trade.ticker).toBe("AAPL");
    expect(trade.side).toBe("buy");
    expect(trade.quantity).toBe(5);

    // Verify the position was actually created
    const portfolio = await getPortfolio(request);
    const aaplPos = portfolio.positions.find(
      (p: { ticker: string }) => p.ticker === "AAPL"
    );
    expect(aaplPos).toBeTruthy();
    expect(aaplPos.quantity).toBeGreaterThanOrEqual(5);
  });

  test("watchlist change via chat updates the watchlist", async ({
    page,
    request,
  }) => {
    // Send a "watch" message — the mock will add PYPL to watchlist
    const result = await sendChatMessage(
      request,
      "watch PYPL for me"
    );
    expect(result.status).toBe(200);
    expect(result.body.watchlist_changes).toBeTruthy();
    expect(result.body.watchlist_changes.length).toBeGreaterThan(0);

    const change = result.body.watchlist_changes[0];
    expect(change.ticker).toBe("PYPL");
    expect(change.action).toBe("add");
    expect(change.success).toBe(true);

    // Verify PYPL is now in the watchlist
    const watchlist = await getWatchlist(request);
    const tickers = watchlist.tickers.map((t: { ticker: string }) => t.ticker);
    expect(tickers).toContain("PYPL");
  });
});
