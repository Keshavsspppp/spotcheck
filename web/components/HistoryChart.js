"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatHour } from "@/lib/formatHour";

export default function HistoryChart({ data }) {
  const chartData = data.map((d) => ({ ...d, label: formatHour(d.hour) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2f36" vertical={false} />
        <XAxis
          dataKey="label"
          interval={2}
          tick={{ fontSize: 11, fill: "#a8a296" }}
          axisLine={{ stroke: "#2a2f36" }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#a8a296" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [value, "avg check-ins"]}
          labelFormatter={(label) => `${label}`}
          contentStyle={{ background: "#1b1f24", border: "1px solid #2a2f36", borderRadius: 4 }}
          labelStyle={{ color: "#f4efe4" }}
          itemStyle={{ color: "#f2a93b" }}
        />
        <Bar dataKey="avgCheckins" fill="#f2a93b" radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
