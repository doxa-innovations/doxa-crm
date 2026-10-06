"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ApiErrorPayload, LeadFunnelResponse } from "@/types/api";

const DASHBOARD_REFETCH_INTERVAL = 300000;

interface FunnelRow {
  fill: string;
  stage: string;
  total: number;
}

interface FunnelTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: FunnelRow }>;
}

function getErrorMessage(error: unknown): string {
  const apiError = error as Partial<ApiErrorPayload>;
  return typeof apiError.detail === "string"
    ? apiError.detail
    : "Could not load lead funnel.";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

function FunnelTooltip({ active, payload }: FunnelTooltipProps) {
  const item = payload?.[0]?.payload;

  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
      <p className="font-semibold text-[var(--navy)]">{item.stage}</p>
      <p className="mt-1 text-[var(--muted-foreground)]">
        {item.total.toLocaleString()} records
      </p>
    </div>
  );
}

export function LeadFunnelChart() {
  const [chartReady, setChartReady] = useState(false);
  const { data, error, isError, isLoading, isFetching, refetch } = useQuery({
    queryFn: () => api.get<LeadFunnelResponse>("/reports/lead-funnel"),
    queryKey: ["dashboard", "lead-funnel"],
    refetchInterval: DASHBOARD_REFETCH_INTERVAL,
  });

  useEffect(() => {
    setChartReady(true);
  }, []);

  const chartData = useMemo<FunnelRow[]>(
    () =>
      data
        ? [
            { fill: "var(--primary)", stage: "Leads", total: data.total_leads },
            {
              fill: "#0F766E",
              stage: "Qualified",
              total: data.qualified_leads,
            },
            { fill: "#7C3AED", stage: "Won", total: data.won_deals },
          ]
        : [],
    [data],
  );

  return (
    <section className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">
            Lead Funnel
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Leads to qualified opportunities to won deals.
          </p>
        </div>
        {isError ? (
          <button
            className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
            onClick={() => void refetch()}
            type="button"
          >
            <RefreshCcw
              className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
              aria-hidden="true"
            />
            Retry
          </button>
        ) : null}
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="h-[280px]">
          {isLoading ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : isError || !data ? (
            <div className="flex h-full items-center rounded-lg border border-red-100 bg-red-50/50 p-4 text-sm text-red-700">
              {getErrorMessage(error)}
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/40 text-sm text-[var(--muted-foreground)]">
              No lead funnel data yet.
            </div>
          ) : chartReady ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ bottom: 8, left: 0, right: 20, top: 8 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="#E2E8F0"
                  strokeDasharray="4 4"
                />
                <XAxis
                  axisLine={false}
                  fontSize={12}
                  tick={{ fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  dataKey="stage"
                  fontSize={12}
                  tick={{ fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  type="category"
                  width={82}
                />
                <Tooltip
                  content={<FunnelTooltip />}
                  cursor={{ fill: "#F8FAFC" }}
                />
                <Bar dataKey="total" radius={[0, 8, 8, 0]}>
                  {chartData.map((entry) => (
                    <Cell fill={entry.fill} key={entry.stage} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="h-full w-full rounded-lg" />
          )}
        </div>

        {!isLoading && data ? (
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200/70 bg-slate-50/60 p-3">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Lead to Qualified
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--navy)]">
                {formatPercent(data.qualification_rate)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200/70 bg-slate-50/60 p-3">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Lead to Converted
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--navy)]">
                {formatPercent(data.conversion_rate)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200/70 bg-slate-50/60 p-3">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Qualified to Won
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--navy)]">
                {formatPercent(data.win_rate)}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
