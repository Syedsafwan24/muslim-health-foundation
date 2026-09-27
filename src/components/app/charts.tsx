"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// Chart ramp from docs/04 §2. Every series has a legend or direct label, never colour alone.
export const RAMP = ["#1B2A5B", "#0E7A5F", "#A86A0B", "#4A3E86", "#2B5FA8", "#8A6A1F", "#6E4A6B", "#4C6B5A"];

const inr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${Math.round(n / 1e3)}K` : `₹${n}`;
const inrFull = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const month = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mm - 1]} ${String(y).slice(2)}`;
};
const axis = { fontSize: 12, fill: "#5A6683" };
const tooltipStyle = { borderRadius: 10, border: "1px solid #D7DCE7", boxShadow: "0 8px 24px -8px rgba(22,33,61,.18)", fontSize: 13 };

export function FlowChart({ data }: { data: { month: string; donations: number; disbursed: number }[] }) {
  return (
    <div className="h-72" role="img" aria-label="Line chart of donations received and amount paid by month">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#D7DCE7" vertical={false} />
          <XAxis dataKey="month" tickFormatter={month} tick={axis} tickLine={false} axisLine={{ stroke: "#D7DCE7" }} />
          <YAxis tickFormatter={inr} tick={axis} tickLine={false} axisLine={false} width={64} />
          <Tooltip formatter={(v: number) => inrFull(v)} labelFormatter={month} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line type="monotone" dataKey="donations" name="Donations" stroke={RAMP[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="disbursed" name="Paid" stroke={RAMP[0]} strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, label }: { data: { name: string; value: number }[]; label: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]" role="img" aria-label={label}>
      <div className="h-44">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="95%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={RAMP[i % RAMP.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* direct labels */}
      <ul className="space-y-1.5 self-center text-ui">
        {data.slice(0, 8).map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-sm" style={{ background: RAMP[i % RAMP.length] }} />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="tabular-nums text-slate-body">{d.value} · {total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ data, label }: { data: { name: string; amount: number }[]; label: string }) {
  return (
    <div style={{ height: Math.max(120, data.length * 36 + 20) }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={180} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v: number) => inrFull(v)} contentStyle={tooltipStyle} cursor={{ fill: "#F2F4FA" }} />
          <Bar dataKey="amount" name="Amount paid" fill={RAMP[0]} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", formatter: inr, fontSize: 12, fill: "#16213D" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthBars({ data, dataKey, name, money = true }: { data: Record<string, string | number>[]; dataKey: string; name: string; money?: boolean }) {
  return (
    <div className="h-64" role="img" aria-label={`Bar chart: ${name} by month`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#D7DCE7" vertical={false} />
          <XAxis dataKey="month" tickFormatter={month} tick={axis} tickLine={false} axisLine={{ stroke: "#D7DCE7" }} />
          <YAxis tickFormatter={money ? inr : undefined} allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={money ? 64 : 32} />
          <Tooltip formatter={(v: number) => (money ? inrFull(v) : v)} labelFormatter={month} contentStyle={tooltipStyle} cursor={{ fill: "#F2F4FA" }} />
          <Bar dataKey={dataKey} name={name} fill={RAMP[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthLine({ data, dataKey, name }: { data: Record<string, string | number>[]; dataKey: string; name: string }) {
  return (
    <div className="h-64" role="img" aria-label={`Line chart: ${name} by month`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#D7DCE7" vertical={false} />
          <XAxis dataKey="month" tickFormatter={month} tick={axis} tickLine={false} axisLine={{ stroke: "#D7DCE7" }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={32} />
          <Tooltip labelFormatter={month} contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey={dataKey} name={name} stroke={RAMP[0]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedBars({ data, keys, category, label }: { data: Record<string, string | number>[]; keys: string[]; category: string; label: string }) {
  return (
    <div className="h-64" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#D7DCE7" vertical={false} />
          <XAxis dataKey={category} tick={axis} tickLine={false} axisLine={{ stroke: "#D7DCE7" }} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#F2F4FA" }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {keys.map((k, i) => <Bar key={k} dataKey={k} fill={RAMP[i % RAMP.length]} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
