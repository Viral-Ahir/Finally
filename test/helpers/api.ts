import { type APIRequestContext } from "@playwright/test";

/**
 * Helper functions for making API calls during tests.
 * These use Playwright's built-in request context for proper base URL handling.
 */

/** GET /api/portfolio — returns current portfolio state */
export async function getPortfolio(request: APIRequestContext) {
  const res = await request.get("/api/portfolio");
  return res.json();
}

/** POST /api/portfolio/trade — execute a buy or sell */
export async function executeTrade(
  request: APIRequestContext,
  ticker: string,
  quantity: number,
  side: "buy" | "sell"
) {
  const res = await request.post("/api/portfolio/trade", {
    data: { ticker, quantity, side },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

/** GET /api/watchlist — returns current watchlist with prices */
export async function getWatchlist(request: APIRequestContext) {
  const res = await request.get("/api/watchlist");
  return res.json();
}

/** POST /api/watchlist — add a ticker */
export async function addToWatchlist(
  request: APIRequestContext,
  ticker: string
) {
  const res = await request.post("/api/watchlist", {
    data: { ticker },
  });
  return res.json();
}

/** DELETE /api/watchlist/:ticker — remove a ticker */
export async function removeFromWatchlist(
  request: APIRequestContext,
  ticker: string
) {
  const res = await request.delete(`/api/watchlist/${ticker}`);
  return { status: res.status() };
}

/** GET /api/portfolio/history — returns portfolio snapshots */
export async function getPortfolioHistory(request: APIRequestContext) {
  const res = await request.get("/api/portfolio/history");
  return res.json();
}

/** POST /api/chat — send a chat message */
export async function sendChatMessage(
  request: APIRequestContext,
  message: string
) {
  const res = await request.post("/api/chat", {
    data: { message },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

/** GET /api/health — health check */
export async function healthCheck(request: APIRequestContext) {
  const res = await request.get("/api/health");
  return res.json();
}
