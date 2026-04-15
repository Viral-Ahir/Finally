"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { sendChatMessage } from "@/lib/api";
import type { ChatResponse, ChatTradeAction, ChatWatchlistAction } from "@/lib/types";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trades?: ChatTradeAction[];
  watchlist_changes?: ChatWatchlistAction[];
  trade_errors?: string[];
  isError?: boolean;
}

function TradeConfirmation({ trade }: { trade: ChatTradeAction }) {
  const isBuy = trade.side === "buy";
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono ${
        isBuy
          ? "bg-green-up/15 text-green-up"
          : "bg-red-down/15 text-red-down"
      }`}
    >
      <span>{isBuy ? "BUY" : "SELL"}</span>
      <span className="font-bold">{trade.quantity}</span>
      <span>{trade.ticker}</span>
    </div>
  );
}

function WatchlistChange({ change }: { change: ChatWatchlistAction }) {
  const isAdd = change.action === "add";
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-accent-yellow/15 text-accent-yellow">
      <span>{isAdd ? "+" : "-"}</span>
      <span className="font-bold">{change.ticker}</span>
      <span>{isAdd ? "added" : "removed"}</span>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <div className="flex gap-1">
        <div
          className="w-1.5 h-1.5 rounded-full bg-blue-primary animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <div
          className="w-1.5 h-1.5 rounded-full bg-blue-primary animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <div
          className="w-1.5 h-1.5 rounded-full bg-blue-primary animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-[10px] text-text-muted ml-1">Thinking...</span>
    </div>
  );
}

interface ChatPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onDataChange?: () => void;
}

export function ChatPanel({ isOpen, onToggle, onDataChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idCounter = useRef(0);

  function nextId(): string {
    return `msg-${++idCounter.current}`;
  }

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: DisplayMessage = {
      id: nextId(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response: ChatResponse = await sendChatMessage(text);

      const assistantMsg: DisplayMessage = {
        id: nextId(),
        role: "assistant",
        content: response.message,
        trades: response.trades,
        watchlist_changes: response.watchlist_changes,
        trade_errors: response.trade_errors,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Notify parent if trades or watchlist changes occurred
      if (
        (response.trades && response.trades.length > 0) ||
        (response.watchlist_changes && response.watchlist_changes.length > 0)
      ) {
        onDataChange?.();
      }
    } catch (err) {
      const errorMsg: DisplayMessage = {
        id: nextId(),
        role: "assistant",
        content: err instanceof Error ? err.message : "Failed to get response",
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, onDataChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Toggle button (always visible)
  const toggleButton = (
    <button
      onClick={onToggle}
      className="absolute -left-6 top-3 w-6 h-12 bg-bg-panel border border-r-0 border-border-muted rounded-l flex items-center justify-center text-text-muted hover:text-accent-yellow transition-colors z-10"
      title={isOpen ? "Close chat" : "Open AI chat"}
    >
      <span className="text-[10px]">{isOpen ? ">" : "<"}</span>
    </button>
  );

  if (!isOpen) {
    return (
      <div className="relative w-0">
        {toggleButton}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full w-[340px] bg-bg-panel border-l border-border-muted shrink-0">
      {toggleButton}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-muted">
        <h2 className="text-xs font-semibold text-accent-yellow uppercase tracking-wider">
          AI Assistant
        </h2>
        <span className="text-[10px] text-text-muted">FinAlly AI</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <p className="text-xs text-text-muted">
                Ask me about your portfolio, request trades, or get market analysis.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            {/* Role label */}
            <span className="text-[9px] text-text-muted mb-0.5 px-1">
              {msg.role === "user" ? "You" : "FinAlly"}
            </span>

            {/* Message bubble */}
            <div
              className={`max-w-[90%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-primary/20 text-text-primary"
                  : msg.isError
                    ? "bg-red-down/10 text-red-down border border-red-down/20"
                    : "bg-bg-card text-text-primary"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* Trade confirmations */}
              {msg.trades && msg.trades.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.trades.map((trade, i) => (
                    <TradeConfirmation key={i} trade={trade} />
                  ))}
                </div>
              )}

              {/* Watchlist changes */}
              {msg.watchlist_changes && msg.watchlist_changes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.watchlist_changes.map((change, i) => (
                    <WatchlistChange key={i} change={change} />
                  ))}
                </div>
              )}

              {/* Trade errors */}
              {msg.trade_errors && msg.trade_errors.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {msg.trade_errors.map((err, i) => (
                    <p key={i} className="text-[10px] text-red-down">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && <LoadingIndicator />}
      </div>

      {/* Input area */}
      <div className="border-t border-border-muted p-2">
        <div className="flex gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI..."
            disabled={loading}
            rows={1}
            className="flex-1 bg-bg-darkest text-text-primary text-xs px-2.5 py-2 rounded border border-border-muted focus:border-blue-primary focus:outline-none placeholder:text-text-muted resize-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-purple-secondary hover:bg-purple-secondary/80 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded transition-colors shrink-0"
          >
            Send
          </button>
        </div>
        <p className="text-[9px] text-text-muted mt-1 px-1">
          Enter to send, Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
