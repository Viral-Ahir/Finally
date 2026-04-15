"use client";

import { useRef, useEffect } from "react";
import { createChart, AreaSeries, type IChartApi, type ISeriesApi, type AreaSeriesPartialOptions, ColorType } from "lightweight-charts";
import { useMarket } from "@/hooks/useMarketContext";

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

export function PriceChart() {
  const { selectedTicker, prices, priceHistory } = useMarket();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const currentTickerRef = useRef<string | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#1a1a2e" },
        textColor: "#8b8b9e",
        fontSize: 11,
        fontFamily:
          '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
      },
      grid: {
        vertLines: { color: "#2d2d3d" },
        horzLines: { color: "#2d2d3d" },
      },
      crosshair: {
        vertLine: { color: "#5a5a6e", width: 1, labelBackgroundColor: "#2d2d3d" },
        horzLine: { color: "#5a5a6e", width: 1, labelBackgroundColor: "#2d2d3d" },
      },
      rightPriceScale: {
        borderColor: "#2d2d3d",
      },
      timeScale: {
        borderColor: "#2d2d3d",
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#209dd7",
      topColor: "rgba(32, 157, 215, 0.3)",
      bottomColor: "rgba(32, 157, 215, 0.02)",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: "#209dd7",
    } as AreaSeriesPartialOptions);

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update chart data when selectedTicker or priceHistory changes
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !selectedTicker) return;

    const history = priceHistory.get(selectedTicker);
    if (!history || history.length === 0) return;

    // If ticker changed, replace all data
    if (currentTickerRef.current !== selectedTicker) {
      currentTickerRef.current = selectedTicker;
      series.setData(
        history.map((p) => ({
          time: p.time as import("lightweight-charts").UTCTimestamp,
          value: p.price,
        }))
      );
      chart.timeScale().fitContent();
    } else {
      // Same ticker - just update the latest point
      const last = history[history.length - 1];
      series.update({
        time: last.time as import("lightweight-charts").UTCTimestamp,
        value: last.price,
      });
    }
  });

  const price = selectedTicker ? prices.get(selectedTicker) : undefined;

  const directionColor = price
    ? price.direction === "up"
      ? "text-green-up"
      : price.direction === "down"
        ? "text-red-down"
        : "text-text-secondary"
    : "text-text-muted";

  return (
    <div className="flex flex-col h-full bg-bg-panel">
      {/* Chart header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border-muted">
        {selectedTicker ? (
          <>
            <span className="text-sm font-bold text-text-primary">
              {selectedTicker}
            </span>
            {price && (
              <>
                <span className={`text-sm font-mono tabular-nums ${directionColor}`}>
                  {formatPrice(price.price)}
                </span>
                <span className={`text-xs font-mono tabular-nums ${directionColor}`}>
                  {formatChange(price.change)}
                </span>
                <span className={`text-xs font-mono tabular-nums ${directionColor}`}>
                  ({formatPercent(price.change_percent)})
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-xs text-text-muted">
            Select a ticker from the watchlist
          </span>
        )}
      </div>

      {/* Chart container */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="absolute inset-0" />
        {!selectedTicker && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-text-muted text-sm">
              Click a ticker to view its chart
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
