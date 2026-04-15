"use client";

import { useState, useEffect } from "react";
import { useMarket } from "@/hooks/useMarketContext";
import { getPortfolio } from "@/lib/api";
import type { Position } from "@/lib/types";

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatPercent(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function PositionsTable() {
  const { prices } = useMarket();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchPositions() {
      try {
        const data = await getPortfolio();
        if (active) setPositions(data.positions);
      } catch {
        // silently fail
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-xs text-text-muted">Loading positions...</span>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-xs text-text-muted">
          No positions. Execute a trade to get started.
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted uppercase text-[10px] border-b border-border-muted">
            <th className="text-left px-2 py-1.5 font-medium">Ticker</th>
            <th className="text-right px-2 py-1.5 font-medium">Qty</th>
            <th className="text-right px-2 py-1.5 font-medium">Avg Cost</th>
            <th className="text-right px-2 py-1.5 font-medium">Price</th>
            <th className="text-right px-2 py-1.5 font-medium">P&L</th>
            <th className="text-right px-2 py-1.5 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const livePrice = prices.get(pos.ticker);
            const currentPrice = livePrice
              ? livePrice.price
              : pos.current_price;
            const pnl = (currentPrice - pos.avg_cost) * pos.quantity;
            const pctChange =
              pos.avg_cost > 0
                ? ((currentPrice - pos.avg_cost) / pos.avg_cost) * 100
                : 0;
            const pnlColor =
              pnl >= 0 ? "text-green-up" : "text-red-down";

            return (
              <tr
                key={pos.ticker}
                className="border-b border-border-subtle hover:bg-bg-card transition-colors"
              >
                <td className="px-2 py-1.5 font-bold text-text-primary">
                  {pos.ticker}
                </td>
                <td className="text-right px-2 py-1.5 font-mono tabular-nums text-text-secondary">
                  {pos.quantity}
                </td>
                <td className="text-right px-2 py-1.5 font-mono tabular-nums text-text-secondary">
                  {formatPrice(pos.avg_cost)}
                </td>
                <td className="text-right px-2 py-1.5 font-mono tabular-nums text-text-primary">
                  {formatPrice(currentPrice)}
                </td>
                <td
                  className={`text-right px-2 py-1.5 font-mono tabular-nums ${pnlColor}`}
                >
                  {formatCurrency(pnl)}
                </td>
                <td
                  className={`text-right px-2 py-1.5 font-mono tabular-nums ${pnlColor}`}
                >
                  {formatPercent(pctChange)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
