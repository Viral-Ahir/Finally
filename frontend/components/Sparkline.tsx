"use client";

import { useRef, useEffect, memo } from "react";

interface SparklineProps {
  data: { time: number; price: number }[];
  width?: number;
  height?: number;
  color?: string;
}

function SparklineInner({
  data,
  width = 100,
  height = 28,
  color,
}: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const padding = 2;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;

    // Determine color: if last price > first price, green, else red
    const lineColor =
      color ??
      (prices[prices.length - 1] >= prices[0] ? "#00c853" : "#ff1744");

    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";

    for (let i = 0; i < prices.length; i++) {
      const x = padding + (i / (prices.length - 1)) * drawWidth;
      const y = padding + drawHeight - ((prices[i] - min) / range) * drawHeight;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Subtle gradient fill beneath the line
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, lineColor + "30");
    gradient.addColorStop(1, lineColor + "05");

    ctx.lineTo(padding + drawWidth, padding + drawHeight);
    ctx.lineTo(padding, padding + drawHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }, [data, width, height, color]);

  if (data.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center"
      >
        <span className="text-text-muted text-[10px]">--</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  );
}

export const Sparkline = memo(SparklineInner);
