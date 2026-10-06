"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { DealForecastResponse, ForecastStage } from "@/types/api";

interface ForecastChartProps {
  pipelineId?: string;
  currency?: string;
}

interface ForecastTooltipProps {
  active?: boolean;
  currency?: string;
  payload?: Array<{ payload: ForecastStage }>;
}

function ForecastTooltip({ active, payload, currency }: ForecastTooltipProps) {
  const item = payload?.[0]?.payload;

  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
      <p className="font-semibold text-[var(--navy)]">{item.stage}</p>
      <p className="mt-1 text-[var(--muted-foreground)]">Deals: {item.count}</p>
      <p className="text-[var(--muted-foreground)]">
        Open: {formatCurrency(item.value, currency)}
      </p>
      <p className="font-medium text-[var(--primary)]">
        Weighted: {formatCurrency(item.weighted, currency)}
      </p>
    </div>
  );
}

export function ForecastChart({
  pipelineId,
  currency = "USD",
}: ForecastChartProps) {
  const [chartReady, setChartReady] = useState(false);
  const forecastQuery = useQuery({
    enabled: Boolean(pipelineId),
    queryFn: () =>
      api.get<DealForecastResponse>("/deals/forecast", {
        pipeline_id: pipelineId,
        currency,
      }),
    queryKey: ["deals", "forecast", pipelineId, currency],
  });

  useEffect(() => {
    setChartReady(true);
  }, []);

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-[var(--navy)]">
          Forecast by Stage
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Open value vs weighted value.
        </p>
      </div>
      <div className="mt-5 h-[260px]">
        {forecastQuery.isLoading ? (
          <Skeleton className="h-full rounded-xl" />
        ) : null}
        {forecastQuery.isError ? (
          <div className="flex h-full items-center rounded-xl border border-red-100 bg-red-50/50 p-4 text-sm text-red-700">
            Could not load forecast.
          </div>
        ) : null}
        {!forecastQuery.isLoading && !forecastQuery.isError && chartReady ? (
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={forecastQuery.data?.by_stage ?? []}
              margin={{ bottom: 8, left: 0, right: 8, top: 8 }}
            >
              <CartesianGrid stroke="#E2E8F0" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="stage"
                fontSize={12}
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                fontSize={12}
                tick={{ fill: "var(--muted-foreground)" }}
                tickFormatter={(value: number) =>
                  `$${Math.round(value / 1000)}k`
                }
                tickLine={false}
                width={52}
              />
              <Tooltip
                content={<ForecastTooltip currency={currency} />}
                cursor={{ fill: "var(--background)" }}
              />
              <Bar
                dataKey="value"
                fill="#93C5FD"
                name="Open Value"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="weighted"
                fill="var(--primary)"
                name="Weighted Value"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </section>
  );
}
