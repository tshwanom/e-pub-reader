"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function RevenueChart({
  data,
}: {
  data: { date: string; total: number }[];
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="surface-card min-w-0 p-6">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
          Revenue
        </p>
        <h3 className="mt-2 text-lg font-semibold text-landing-text">Completed donations over the last 30 days</h3>
      </div>
      <div className="h-[300px] w-full min-w-0">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
            <BarChart data={data}>
              <XAxis
                dataKey="date"
                stroke="#5f6b76"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#5f6b76"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                  cursor={{ fill: 'rgba(61, 115, 122, 0.06)' }}
                  contentStyle={{ borderRadius: '16px', border: '1px solid rgba(216, 224, 228, 0.8)', boxShadow: '0 10px 30px rgba(17, 24, 39, 0.08)' }}
              />
              <Bar dataKey="total" fill="#3D737A" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full rounded-2xl bg-white/40" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
