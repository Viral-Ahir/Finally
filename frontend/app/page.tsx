"use client";

import { useState, useCallback } from "react";
import { MarketProvider } from "@/hooks/useMarketContext";
import { Header } from "@/components/Header";
import { Watchlist } from "@/components/Watchlist";
import { PriceChart } from "@/components/PriceChart";
import { PortfolioHeatmap } from "@/components/PortfolioHeatmap";
import { PnlChart } from "@/components/PnlChart";
import { PositionsTable } from "@/components/PositionsTable";
import { TradeBar } from "@/components/TradeBar";
import { ChatPanel } from "@/components/ChatPanel";

export default function Home() {
  const [chatOpen, setChatOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleToggleChat = useCallback(() => {
    setChatOpen((prev) => !prev);
  }, []);

  // Called when AI chat executes trades or watchlist changes
  const handleDataChange = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <MarketProvider>
      <div className="flex flex-col h-screen bg-bg-darkest overflow-hidden">
        {/* Header */}
        <Header key={`header-${refreshKey}`} />

        {/* Main content area */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Watchlist */}
          <div className="w-[260px] shrink-0">
            <Watchlist key={`watchlist-${refreshKey}`} />
          </div>

          {/* Center: Charts + Portfolio */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Top: Main price chart */}
            <div className="flex-1 min-h-[200px]">
              <PriceChart />
            </div>

            {/* Middle: Heatmap + P&L chart side by side */}
            <div className="flex border-t border-border-muted h-[180px]">
              <div className="flex-1 border-r border-border-muted">
                <div className="flex items-center px-3 py-1 border-b border-border-subtle">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                    Portfolio Heatmap
                  </span>
                </div>
                <div className="h-[calc(100%-24px)]">
                  <PortfolioHeatmap key={`heatmap-${refreshKey}`} />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center px-3 py-1 border-b border-border-subtle">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                    P&L
                  </span>
                </div>
                <div className="h-[calc(100%-24px)]">
                  <PnlChart key={`pnl-${refreshKey}`} />
                </div>
              </div>
            </div>

            {/* Bottom: Positions table + Trade bar */}
            <div className="border-t border-border-muted">
              <div className="flex items-center justify-between px-3 py-1 border-b border-border-subtle">
                <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                  Positions
                </span>
              </div>
              <div className="max-h-[140px] overflow-auto">
                <PositionsTable key={`positions-${refreshKey}`} />
              </div>
              <TradeBar />
            </div>
          </div>

          {/* Right: AI Chat Panel */}
          <ChatPanel
            isOpen={chatOpen}
            onToggle={handleToggleChat}
            onDataChange={handleDataChange}
          />
        </div>
      </div>
    </MarketProvider>
  );
}
