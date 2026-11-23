"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#3157C8", "#E8B75A", "#73B9F5", "#101C35", "#10b981", "#f43f5e", "#8b5cf6", "#f97316"];

const tooltipStyle = { borderRadius: 12, border: "1px solid #E9ECFF", background: "rgba(255,255,255,0.95)", fontSize: 12 };

export function TrendChart({ data, xKey, lines, height = 260, domain }: { data: Record<string, unknown>[]; xKey: string; lines: { key: string; label?: string }[]; height?: number; domain?: [number, number] }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E9ECFF" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#8993A8" }} />
          <YAxis domain={domain ?? [0, 100]} tick={{ fontSize: 11, fill: "#8993A8" }} />
          <Tooltip contentStyle={tooltipStyle} />
          {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {lines.map((l, i) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.label ?? l.key} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, xKey, bars, height = 260, domain, layout }: { data: Record<string, unknown>[]; xKey: string; bars: { key: string; label?: string }[]; height?: number; domain?: [number, number]; layout?: "vertical" | "horizontal" }) {
  const vertical = layout === "vertical";
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: vertical ? 40 : -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E9ECFF" />
          {vertical ? (
            <>
              <XAxis type="number" domain={domain} tick={{ fontSize: 11, fill: "#8993A8" }} />
              <YAxis type="category" dataKey={xKey} width={110} tick={{ fontSize: 11, fill: "#202B45" }} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#8993A8" }} />
              <YAxis domain={domain} tick={{ fontSize: 11, fill: "#8993A8" }} allowDecimals={false} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(49,87,200,0.06)" }} />
          {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {bars.map((b, i) => (
            <Bar key={b.key} dataKey={b.key} name={b.label ?? b.key} fill={COLORS[i % COLORS.length]} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, height = 240 }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
