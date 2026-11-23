"use client";
import { useEffect, useState } from "react";

/** Live countdown to a Lagos HH:MM time today. */
export function Countdown({ time }: { time: string }) {
  const calc = () => {
    const [h, m] = time.split(":").map(Number);
    const n = new Date(Date.now() + 3600_000);
    const diff = h * 60 + m - (n.getUTCHours() * 60 + n.getUTCMinutes()) - n.getUTCSeconds() / 60;
    return Math.max(0, Math.round(diff * 60));
  };
  const [s, setS] = useState(calc);
  useEffect(() => { const t = setInterval(() => setS(calc()), 1000); return () => clearInterval(t); });
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return <span className="font-display tabular-nums">{hh > 0 && `${hh}h `}{String(mm).padStart(2, "0")}m {String(ss).padStart(2, "0")}s</span>;
}
