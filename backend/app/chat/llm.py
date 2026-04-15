"""LLM integration via LiteLLM -> OpenRouter -> Cerebras."""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant in a simulated trading workstation. You help users manage a virtual portfolio with fake money ($10,000 starting balance).

Your capabilities:
- Analyze portfolio composition, risk concentration, and P&L
- Suggest and execute trades when the user asks or agrees
- Manage the watchlist (add/remove tickers)
- Provide concise, data-driven insights

Rules:
- Always respond with valid JSON matching the required schema
- Be concise and data-driven
- When the user asks to buy or sell, include the trade in your response
- When the user mentions watching or tracking a ticker, add it to the watchlist
- If a trade would fail (insufficient cash/shares), explain why instead of including it
- Use the portfolio context provided to give informed recommendations
- Quantities must be positive numbers
- Side must be "buy" or "sell"
- Watchlist action must be "add" or "remove"
"""


class TradeAction(BaseModel):
    ticker: str
    side: str = Field(pattern="^(buy|sell)$")
    quantity: float = Field(gt=0)


class WatchlistChange(BaseModel):
    ticker: str
    action: str = Field(pattern="^(add|remove)$")


class LLMResponse(BaseModel):
    message: str
    trades: list[TradeAction] = Field(default_factory=list)
    watchlist_changes: list[WatchlistChange] = Field(default_factory=list)


def _build_context(portfolio: dict, watchlist: list[dict]) -> str:
    """Build a context string from portfolio and watchlist data."""
    lines = ["## Current Portfolio"]
    lines.append(f"- Cash: ${portfolio['cash_balance']:,.2f}")
    lines.append(f"- Total Value: ${portfolio['total_value']:,.2f}")

    if portfolio["positions"]:
        lines.append("\n### Positions")
        for pos in portfolio["positions"]:
            pnl_sign = "+" if pos["unrealized_pnl"] >= 0 else ""
            lines.append(
                f"- {pos['ticker']}: {pos['quantity']} shares @ avg ${pos['avg_cost']:.2f} "
                f"(current ${pos['current_price']:.2f}, P&L: {pnl_sign}${pos['unrealized_pnl']:.2f}, "
                f"{pnl_sign}{pos['pct_change']:.2f}%)"
            )
    else:
        lines.append("\nNo positions held.")

    lines.append("\n## Watchlist (with live prices)")
    for item in watchlist:
        if item["price"] is not None:
            direction = item.get("direction", "flat")
            lines.append(f"- {item['ticker']}: ${item['price']:.2f} ({direction})")
        else:
            lines.append(f"- {item['ticker']}: price not available")

    return "\n".join(lines)


def _build_messages(
    context: str,
    chat_history: list[dict],
    user_message: str,
) -> list[dict]:
    """Build the messages array for the LLM call."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + context}]

    for msg in chat_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})
    return messages


async def call_llm(
    portfolio: dict,
    watchlist: list[dict],
    chat_history: list[dict],
    user_message: str,
) -> LLMResponse:
    """Call the LLM and return a structured response.

    If LLM_MOCK=true, returns a deterministic mock response.
    """
    if os.environ.get("LLM_MOCK", "").lower() == "true":
        return _mock_response(user_message)

    context = _build_context(portfolio, watchlist)
    messages = _build_messages(context, chat_history, user_message)

    try:
        from litellm import completion

        response = completion(
            model=MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
        )
        content = response.choices[0].message.content
        return _parse_llm_response(content)
    except Exception as e:
        logger.exception("LLM call failed")
        return LLMResponse(
            message=f"I'm sorry, I encountered an error processing your request: {str(e)}",
            trades=[],
            watchlist_changes=[],
        )


def _parse_llm_response(content: str) -> LLMResponse:
    """Parse LLM response JSON, handling common schema deviations."""
    # Strip markdown code fences if present (```json ... ```)
    text = content.strip()
    if text.startswith("```"):
        # Remove opening fence (```json or ```)
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        # Remove closing fence
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    data = json.loads(text)

    # Normalize field names the LLM might use instead of our schema
    if "message" not in data:
        # Try common alternatives
        for alt in ("text", "response", "content", "reply"):
            if alt in data:
                data["message"] = data.pop(alt)
                break
        else:
            data["message"] = "Here's what I've done based on your request."

    # Handle "watchlist" instead of "watchlist_changes"
    if "watchlist" in data and "watchlist_changes" not in data:
        data["watchlist_changes"] = data.pop("watchlist")

    # Handle "actions" wrapping trades/watchlist
    if "actions" in data and isinstance(data["actions"], dict):
        actions = data.pop("actions")
        if "trades" in actions and "trades" not in data:
            data["trades"] = actions["trades"]
        if "watchlist_changes" in actions and "watchlist_changes" not in data:
            data["watchlist_changes"] = actions["watchlist_changes"]

    return LLMResponse.model_validate(data)


def _mock_response(user_message: str) -> LLMResponse:
    """Return a deterministic mock response for testing."""
    msg_lower = user_message.lower()

    # If the user asks to buy something
    if "buy" in msg_lower:
        return LLMResponse(
            message="I've placed a buy order for 5 shares of AAPL. This is a solid blue-chip addition to your portfolio.",
            trades=[TradeAction(ticker="AAPL", side="buy", quantity=5)],
            watchlist_changes=[],
        )

    # If the user asks to sell
    if "sell" in msg_lower:
        return LLMResponse(
            message="I've placed a sell order for 2 shares of AAPL to take some profits.",
            trades=[TradeAction(ticker="AAPL", side="sell", quantity=2)],
            watchlist_changes=[],
        )

    # If the user asks to watch/track a ticker
    if "watch" in msg_lower or "track" in msg_lower or "add" in msg_lower:
        return LLMResponse(
            message="I've added PYPL to your watchlist so you can track its price.",
            trades=[],
            watchlist_changes=[WatchlistChange(ticker="PYPL", action="add")],
        )

    # Default response with a sample trade and watchlist change
    return LLMResponse(
        message="Here's my analysis of your portfolio. I recommend diversifying with a small position in AAPL, and I've added PYPL to your watchlist for monitoring.",
        trades=[TradeAction(ticker="AAPL", side="buy", quantity=1)],
        watchlist_changes=[WatchlistChange(ticker="PYPL", action="add")],
    )
