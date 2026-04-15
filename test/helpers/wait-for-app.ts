import { type Page, expect } from "@playwright/test";

/**
 * Wait for the backend health check to pass.
 * Retries with exponential backoff up to maxRetries times.
 */
export async function waitForHealthCheck(
  baseURL: string,
  maxRetries = 30,
  initialDelayMs = 500
): Promise<void> {
  let delay = initialDelayMs;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${baseURL}/api/health`);
      if (res.ok) {
        const body = await res.json();
        if (body.status === "ok") {
          return;
        }
      }
    } catch {
      // Connection refused — server not up yet
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 5000);
  }
  throw new Error(
    `App health check at ${baseURL}/api/health did not pass after ${maxRetries} retries`
  );
}

/**
 * Wait for SSE price data to start flowing on the page.
 * The frontend renders prices as numeric text (e.g., "190.07") inside
 * the watchlist rows once the SSE connection delivers data.
 * We also wait for ticker symbols to appear, indicating the watchlist loaded.
 */
export async function waitForPriceData(
  page: Page,
  timeoutMs = 30_000
): Promise<void> {
  // Wait for the watchlist to load tickers (e.g., "AAPL" text to appear)
  // and for price data to flow (prices like "190.07" to appear)
  await page.waitForFunction(
    () => {
      const body = document.body.textContent || "";
      // Check that at least one default ticker is visible
      const hasTicker = /AAPL|GOOGL|MSFT|AMZN/.test(body);
      // Check that numeric prices are visible (format: 3+ digits, dot, 2 digits)
      const hasPrice = /\d{2,}\.\d{2}/.test(body);
      return hasTicker && hasPrice;
    },
    undefined,
    { timeout: timeoutMs }
  );
}

/**
 * Wait for the page to fully load and SSE connection to establish.
 * Combines navigation wait + price data wait.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for the DOM to be ready (don't use networkidle — SSE keeps the network active)
  await page.waitForLoadState("domcontentloaded");
  // Then wait for live price data to appear
  await waitForPriceData(page);
}
