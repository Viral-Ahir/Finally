"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useMarketStream, type MarketStreamState } from "./useMarketStream";
import type { ConnectionStatus, PriceUpdate } from "@/lib/types";

interface MarketContextValue {
  prices: Map<string, PriceUpdate>;
  priceHistory: Map<string, { time: number; price: number }[]>;
  connectionStatus: ConnectionStatus;
  selectedTicker: string | null;
  setSelectedTicker: (ticker: string | null) => void;
}

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const stream: MarketStreamState = useMarketStream();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const selectTicker = useCallback((ticker: string | null) => {
    setSelectedTicker(ticker);
  }, []);

  return (
    <MarketContext.Provider
      value={{
        prices: stream.prices,
        priceHistory: stream.priceHistory,
        connectionStatus: stream.connectionStatus,
        selectedTicker,
        setSelectedTicker: selectTicker,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) {
    throw new Error("useMarket must be used within a MarketProvider");
  }
  return ctx;
}
