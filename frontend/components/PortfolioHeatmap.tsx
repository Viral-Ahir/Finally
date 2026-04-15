"use client";

import { useState, useEffect, useMemo } from "react";
import { useMarket } from "@/hooks/useMarketContext";
import { getPortfolio } from "@/lib/api";
import type { Position } from "@/lib/types";
import { Treemap, ResponsiveContainer } from "recharts";

interface TreemapNode {
  [key: string]: string | number;
  name: string;
  size: number;
  pnl: number;
  pctChange: number;
  fill: string;
}

function pnlToColor(pctChange: number): string {
  // Map pct change to a green/red color gradient
  const clamped = Math.max(-10, Math.min(10, pctChange));
  const intensity = Math.abs(clamped) / 10;

  if (clamped >= 0) {
    // Green gradient: dim green → bright green
    const r = Math.round(20 - 20 * intensity);
    const g = Math.round(80 + 120 * intensity);
    const b = Math.round(40 - 10 * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Red gradient: dim red → bright red
    const r = Math.round(80 + 120 * intensity);
    const g = Math.round(30 - 20 * intensity);
    const b = Math.round(30 - 10 * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function CustomTreemapContent(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  pctChange?: number;
  fill?: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, pctChange, fill } = props;
  if (width < 4 || height < 4) return null;

  const showLabel = width > 30 && height > 20;
  const showPct = width > 50 && height > 32;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#0d1117"
        strokeWidth={2}
        rx={2}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showPct ? 5 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#e0e0e0"
          fontSize={11}
          fontWeight="bold"
          fontFamily="Geist, sans-serif"
        >
          {name}
        </text>
      )}
      {showPct && pctChange !== undefined && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 11}
          textAnchor="middle"
          dominantBaseline="central"
          fill={pctChange >= 0 ? "#a0f0a0" : "#f0a0a0"}
          fontSize={10}
          fontFamily="Geist Mono, monospace"
        >
          {pctChange >= 0 ? "+" : ""}
          {pctChange.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

export function PortfolioHeatmap() {
  const { prices } = useMarket();
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    let active = true;

    async function fetchPositions() {
      try {
        const data = await getPortfolio();
        if (active) setPositions(data.positions);
      } catch {
        // silently fail
      }
    }

    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const treemapData = useMemo(() => {
    if (positions.length === 0) return [];

    return positions.map((pos): TreemapNode => {
      const livePrice = prices.get(pos.ticker);
      const currentPrice = livePrice ? livePrice.price : pos.current_price;
      const value = pos.quantity * currentPrice;
      const pnl = (currentPrice - pos.avg_cost) * pos.quantity;
      const pctChange =
        pos.avg_cost > 0
          ? ((currentPrice - pos.avg_cost) / pos.avg_cost) * 100
          : 0;

      return {
        name: pos.ticker,
        size: Math.abs(value),
        pnl,
        pctChange,
        fill: pnlToColor(pctChange),
      };
    });
  }, [positions, prices]);

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-text-muted">No positions to display</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={treemapData}
        dataKey="size"
        aspectRatio={4 / 3}
        stroke="#0d1117"
        content={<CustomTreemapContent />}
      />
    </ResponsiveContainer>
  );
}
