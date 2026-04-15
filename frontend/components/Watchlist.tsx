"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMarket } from "@/hooks/useMarketContext";
import { getWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/api";
import type { WatchlistEntry, PriceUpdate } from "@/lib/types";
import { Sparkline } from "./Sparkline";

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}`;
}

interface WatchlistRowProps {
  ticker: string;
  price: PriceUpdate | undefined;
  history: { time: number; price: number }[];
  isSelected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

function WatchlistRow({
  ticker,
  price,
  history,
  isSelected,
  onSelect,
  onRemove,
}: WatchlistRowProps) {
  const flashRef = useRef<HTMLDivElement>(null);
  const prevPriceRef = useRef<number | null>(null);

  // Trigger flash animation on price change
  useEffect(() => {
    if (!price || !flashRef.current) return;
    const currentPrice = price.price;
    const prevPrice = prevPriceRef.current;
    prevPriceRef.current = currentPrice;

    if (prevPrice === null || prevPrice === currentPrice) return;

    const el = flashRef.current;
    const cls = currentPrice > prevPrice ? "price-flash-up" : "price-flash-down";
    el.classList.remove("price-flash-up", "price-flash-down");
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add(cls);
  }, [price]);

  const directionColor = price
    ? price.direction === "up"
      ? "text-green-up"
      : price.direction === "down"
        ? "text-red-down"
        : "text-text-secondary"
    : "text-text-muted";

  return (
    <div
      ref={flashRef}
      onClick={() => onSelect(ticker)}
      className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-border-subtle transition-colors hover:bg-bg-card ${
        isSelected ? "bg-bg-card border-l-2 border-l-accent-yellow" : ""
      }`}
    >
      {/* Ticker symbol */}
      <div className="w-14 shrink-0">
        <span className="text-xs font-bold text-text-primary tracking-wide">
          {ticker}
        </span>
      </div>

      {/* Sparkline */}
      <div className="w-[80px] shrink-0">
        <Sparkline data={history} width={80} height={24} />
      </div>

      {/* Price */}
      <div className="flex-1 text-right">
        <span className={`text-xs font-mono tabular-nums ${directionColor}`}>
          {price ? formatPrice(price.price) : "--"}
        </span>
      </div>

      {/* Change */}
      <div className="w-20 text-right">
        {price ? (
          <div className="flex flex-col items-end">
            <span className={`text-[10px] font-mono tabular-nums ${directionColor}`}>
              {formatChange(price.change)}
            </span>
            <span className={`text-[10px] font-mono tabular-nums ${directionColor}`}>
              {formatPercent(price.change_percent)}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">--</span>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(ticker);
        }}
        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-down text-xs ml-1 transition-opacity"
        title="Remove from watchlist"
      >
        ✕
      </button>
    </div>
  );
}

export function Watchlist() {
  const { prices, priceHistory, selectedTicker, setSelectedTicker } =
    useMarket();
  const [tickers, setTickers] = useState<string[]>([]);
  const [newTicker, setNewTicker] = useState("");
  const [loading, setLoading] = useState(true);

  // Load watchlist on mount
  useEffect(() => {
    getWatchlist()
      .then((entries: WatchlistEntry[]) => {
        setTickers(entries.map((e) => e.ticker));
        // Auto-select the first ticker if none selected
        if (entries.length > 0) {
          setSelectedTicker(entries[0].ticker);
        }
      })
      .catch(() => {
        // Silently fail - will retry on next action
      })
      .finally(() => setLoading(false));
  }, [setSelectedTicker]);

  const handleAddTicker = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const ticker = newTicker.trim().toUpperCase();
      if (!ticker || tickers.includes(ticker)) {
        setNewTicker("");
        return;
      }
      try {
        await addToWatchlist(ticker);
        setTickers((prev) => [...prev, ticker]);
        setNewTicker("");
      } catch {
        // Could show error toast
      }
    },
    [newTicker, tickers]
  );

  const handleRemoveTicker = useCallback(
    async (ticker: string) => {
      try {
        await removeFromWatchlist(ticker);
        setTickers((prev) => prev.filter((t) => t !== ticker));
        if (selectedTicker === ticker) {
          setSelectedTicker(null);
        }
      } catch {
        // Could show error toast
      }
    },
    [selectedTicker, setSelectedTicker]
  );

  return (
    <div className="flex flex-col h-full bg-bg-panel border-r border-border-muted">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-muted">
        <h2 className="text-xs font-semibold text-accent-yellow uppercase tracking-wider">
          Watchlist
        </h2>
        <span className="text-[10px] text-text-muted">
          {tickers.length} tickers
        </span>
      </div>

      {/* Add ticker input */}
      <form
        onSubmit={handleAddTicker}
        className="flex items-center gap-1 px-2 py-1.5 border-b border-border-subtle"
      >
        <input
          type="text"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          placeholder="Add ticker..."
          className="flex-1 bg-bg-darkest text-text-primary text-xs px-2 py-1 rounded border border-border-muted focus:border-blue-primary focus:outline-none placeholder:text-text-muted"
          maxLength={10}
        />
        <button
          type="submit"
          className="text-[10px] bg-purple-secondary hover:bg-purple-secondary/80 text-white px-2 py-1 rounded transition-colors"
        >
          Add
        </button>
      </form>

      {/* Ticker rows */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-muted">Loading...</span>
          </div>
        ) : tickers.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-muted">
              No tickers. Add one above.
            </span>
          </div>
        ) : (
          tickers.map((ticker) => (
            <WatchlistRow
              key={ticker}
              ticker={ticker}
              price={prices.get(ticker)}
              history={priceHistory.get(ticker) ?? []}
              isSelected={selectedTicker === ticker}
              onSelect={setSelectedTicker}
              onRemove={handleRemoveTicker}
            />
          ))
        )}
      </div>
    </div>
  );
}
