"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { PriceUpdate, ConnectionStatus } from "@/lib/types";

const SSE_URL = "/api/stream/prices";
const MAX_PRICE_HISTORY = 200;

export interface MarketStreamState {
  /** Latest price for each ticker */
  prices: Map<string, PriceUpdate>;
  /** Price history (for sparklines/charts), keyed by ticker */
  priceHistory: Map<string, { time: number; price: number }[]>;
  /** SSE connection status */
  connectionStatus: ConnectionStatus;
}

export function useMarketStream(): MarketStreamState {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(
    () => new Map()
  );
  const [priceHistory, setPriceHistory] = useState<
    Map<string, { time: number; price: number }[]>
  >(() => new Map());

  const eventSourceRef = useRef<EventSource | null>(null);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Buffers accumulate data between batched state flushes
  const priceBufferRef = useRef<Map<string, PriceUpdate>>(new Map());
  const historyBufferRef = useRef<
    Map<string, { time: number; price: number }[]>
  >(new Map());

  // Batch UI updates to ~100ms intervals for performance
  const scheduleFlush = useCallback(() => {
    if (batchTimerRef.current) return;
    batchTimerRef.current = setTimeout(() => {
      batchTimerRef.current = null;

      // Copy buffers into state
      setPrices(new Map(priceBufferRef.current));
      setPriceHistory(new Map(historyBufferRef.current));
    }, 100);
  }, []);

  useEffect(() => {
    let disposed = false;

    function connect() {
      if (disposed) return;

      const es = new EventSource(SSE_URL);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!disposed) setConnectionStatus("connected");
      };

      es.onmessage = (event) => {
        if (disposed) return;
        try {
          const raw = JSON.parse(event.data);
          // SSE sends a dict keyed by ticker: {"AAPL": {...}, "AMZN": {...}}
          // or possibly an array or single PriceUpdate
          let updates: PriceUpdate[];
          if (Array.isArray(raw)) {
            updates = raw;
          } else if (raw && typeof raw === "object" && !raw.ticker) {
            // Dict keyed by ticker — extract values
            updates = Object.values(raw) as PriceUpdate[];
          } else {
            updates = [raw as PriceUpdate];
          }

          for (const update of updates) {
            priceBufferRef.current.set(update.ticker, update);

            const history =
              historyBufferRef.current.get(update.ticker) ?? [];
            history.push({
              time: new Date(update.timestamp).getTime() / 1000,
              price: update.price,
            });
            if (history.length > MAX_PRICE_HISTORY) {
              history.shift();
            }
            historyBufferRef.current.set(update.ticker, history);
          }

          scheduleFlush();
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        if (disposed) return;
        setConnectionStatus("reconnecting");
        // EventSource automatically retries; we just track state
      };
    }

    connect();

    return () => {
      disposed = true;
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [scheduleFlush]);

  return {
    prices,
    priceHistory,
    connectionStatus,
  };
}
