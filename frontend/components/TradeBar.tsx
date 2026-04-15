"use client";

import { useState, useCallback } from "react";
import { executeTrade } from "@/lib/api";
import { useMarket } from "@/hooks/useMarketContext";
import type { TradeSide } from "@/lib/types";

export function TradeBar() {
  const { selectedTicker } = useMarket();
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync ticker with selected watchlist ticker
  const activeTicker = ticker || selectedTicker || "";

  const handleTrade = useCallback(
    async (side: TradeSide) => {
      const t = activeTicker.trim().toUpperCase();
      const qty = parseFloat(quantity);

      if (!t) {
        setFeedback({ type: "error", message: "Enter a ticker symbol" });
        return;
      }
      if (!qty || qty <= 0) {
        setFeedback({ type: "error", message: "Enter a valid quantity" });
        return;
      }

      setSubmitting(true);
      setFeedback(null);

      try {
        const result = await executeTrade({
          ticker: t,
          quantity: qty,
          side,
        });
        setFeedback({
          type: "success",
          message: `${side === "buy" ? "Bought" : "Sold"} ${result.quantity} ${result.ticker} @ $${result.price.toFixed(2)}`,
        });
        setQuantity("");
      } catch (err) {
        setFeedback({
          type: "error",
          message: err instanceof Error ? err.message : "Trade failed",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [activeTicker, quantity]
  );

  return (
    <div className="bg-bg-panel border-t border-border-muted px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Ticker input */}
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder={selectedTicker || "TICKER"}
          className="w-20 bg-bg-darkest text-text-primary text-xs font-mono px-2 py-1.5 rounded border border-border-muted focus:border-blue-primary focus:outline-none placeholder:text-text-muted uppercase"
        />

        {/* Quantity input */}
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          min="0"
          step="1"
          className="w-20 bg-bg-darkest text-text-primary text-xs font-mono px-2 py-1.5 rounded border border-border-muted focus:border-blue-primary focus:outline-none placeholder:text-text-muted"
        />

        {/* Buy button */}
        <button
          onClick={() => handleTrade("buy")}
          disabled={submitting}
          className="bg-green-up/20 text-green-up hover:bg-green-up/30 disabled:opacity-50 text-xs font-bold px-4 py-1.5 rounded transition-colors"
        >
          BUY
        </button>

        {/* Sell button */}
        <button
          onClick={() => handleTrade("sell")}
          disabled={submitting}
          className="bg-red-down/20 text-red-down hover:bg-red-down/30 disabled:opacity-50 text-xs font-bold px-4 py-1.5 rounded transition-colors"
        >
          SELL
        </button>

        {/* Feedback */}
        {feedback && (
          <span
            className={`text-[10px] ml-2 ${
              feedback.type === "success" ? "text-green-up" : "text-red-down"
            }`}
          >
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  );
}
