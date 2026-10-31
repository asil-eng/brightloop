"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const BRAND = "#714b67";
const ACCENT = "#017e84";
const PALETTE = ["#714b67", "#017e84", "#e0a03a", "#5b8def", "#d9534f", "#7d9d3a", "#a07cc5"];

const inr = (v: number) =>
  v >= 1e7 ? `₹${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `₹${(v / 1e3).toFixed(0)}k` : `₹${v}`;
const full = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Revenue (collected) vs invoiced per month. Values in rupees. */
export function RevenueChart({ data }: { data: { month: string; invoiced: number; collected: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={inr} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
        <Tooltip formatter={(v) => full(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="invoiced" name="Invoiced" fill="#d9c0d2" radius={[4, 4, 0, 0]} />
        <Bar dataKey="collected" name="Collected" fill={BRAND} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, dataKey, name }: { data: Record<string, string | number>[]; dataKey: string; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={40} />
        <Tooltip />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={ACCENT} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, money = false }: { data: { name: string; value: number }[]; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => (money ? full(Number(v)) : Number(v).toLocaleString("en-IN"))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
