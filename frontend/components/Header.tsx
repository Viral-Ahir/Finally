"use client";

import { useState, useEffect } from "react";
import { useMarket } from "@/hooks/useMarketContext";
import { getPortfolio } from "@/lib/api";
import type { Portfolio } from "@/lib/types";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function Header() {
  const { connectionStatus, prices } = useMarket();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  // Fetch portfolio data and refresh periodically
  useEffect(() => {
    let active = true;

    async function fetchPortfolio() {
      try {
        const data = await getPortfolio();
        if (active) setPortfolio(data);
      } catch {
        // silently fail
      }
    }

    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Calculate live total value using SSE prices
  const cashBalance = portfolio?.cash_balance ?? 0;
  let totalValue = portfolio?.total_value ?? 0;

  if (portfolio) {
    let livePositionsValue = 0;
    for (const pos of portfolio.positions) {
      const livePrice = prices.get(pos.ticker);
      const currentPrice = livePrice ? livePrice.price : pos.current_price;
      livePositionsValue += pos.quantity * currentPrice;
    }
    totalValue = cashBalance + livePositionsValue;
  }

  const statusClass =
    connectionStatus === "connected"
      ? "status-connected"
      : connectionStatus === "reconnecting"
        ? "status-reconnecting"
        : "status-disconnected";

  const statusLabel =
    connectionStatus === "connected"
      ? "Live"
      : connectionStatus === "reconnecting"
        ? "Reconnecting"
        : "Disconnected";

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-bg-panel border-b border-border-muted">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-accent-yellow tracking-tight">
          FinAlly
        </h1>
        <span className="text-[10px] text-text-muted">AI Trading Workstation</span>
      </div>

      {/* Portfolio summary */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted uppercase">
            Portfolio
          </span>
          <span className="text-sm font-mono font-bold text-text-primary tabular-nums">
            {formatCurrency(totalValue)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted uppercase">Cash</span>
          <span className="text-sm font-mono text-text-secondary tabular-nums">
            {formatCurrency(cashBalance)}
          </span>
        </div>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span className={`status-dot ${statusClass}`} />
        <span className="text-[10px] text-text-muted">{statusLabel}</span>
      </div>
    </header>
  );
}
