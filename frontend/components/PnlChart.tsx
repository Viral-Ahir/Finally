"use client";

import { useState, useEffect, useMemo } from "react";
import { getPortfolioHistory } from "@/lib/api";
import type { PortfolioSnapshot } from "@/lib/types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

interface ChartDataPoint {
  time: string;
  value: number;
}

function formatValue(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-darkest border border-border-muted px-2 py-1 rounded text-xs">
      <span className="text-text-primary font-mono tabular-nums">
        {formatValue(payload[0].value)}
      </span>
    </div>
  );
}

export function PnlChart() {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchHistory() {
      try {
        const data = await getPortfolioHistory();
        if (active) setSnapshots(data);
      } catch {
        // silently fail
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchHistory();
    const interval = setInterval(fetchHistory, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const chartData = useMemo((): ChartDataPoint[] => {
    return snapshots.map((s) => ({
      time: new Date(s.recorded_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: s.total_value,
    }));
  }, [snapshots]);

  const isProfit =
    chartData.length >= 2
      ? chartData[chartData.length - 1].value >= chartData[0].value
      : true;

  const lineColor = isProfit ? "#00c853" : "#ff1744";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-text-muted">Loading P&L...</span>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-text-muted">No portfolio history yet</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={chartData}
        margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
      >
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={lineColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          axisLine={{ stroke: "#2d2d3d" }}
          tickLine={false}
          tick={{ fill: "#5a5a6e", fontSize: 10 }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={["auto", "auto"]}
          axisLine={{ stroke: "#2d2d3d" }}
          tickLine={false}
          tick={{ fill: "#5a5a6e", fontSize: 10 }}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
          width={50}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={10000}
          stroke="#5a5a6e"
          strokeDasharray="3 3"
          label={{
            value: "Start",
            position: "right",
            fill: "#5a5a6e",
            fontSize: 9,
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={lineColor}
          strokeWidth={1.5}
          fill="url(#pnlGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
