"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { cn, formatReportCurrency } from "@/lib/utils";
import type {
  ApiErrorPayload,
  DashboardResponse,
  PipelineSummaryRow,
} from "@/types/api";

const DASHBOARD_REFETCH_INTERVAL = 300000;

interface PipelineTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PipelineSummaryRow }>;
}

function getErrorMessage(error: unknown): string {
  const apiError = error as Partial<ApiErrorPayload>;
  return typeof apiError.detail === "string"
    ? apiError.detail
    : "Could not load pipeline chart.";
}

function PipelineTooltip({ active, payload }: PipelineTooltipProps) {
  const item = payload?.[0]?.payload;

  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
      <p className="font-semibold text-[var(--navy)]">{item.stage}</p>
      <p className="mt-1 text-[var(--muted-foreground)]">Deals: {item.count}</p>
      <p className="text-[var(--muted-foreground)]">
        Value: {formatReportCurrency(item.total_value)}
      </p>
      <p className="font-medium text-[var(--primary)]">
        Weighted: {formatReportCurrency(item.weighted_value)}
      </p>
    </div>
  );
}

export function PipelineChart() {
  const [chartReady, setChartReady] = useState(false);
  const { data, error, isError, isLoading, isFetching, refetch } = useQuery({
    queryFn: () => api.get<DashboardResponse>("/reports/dashboard"),
    queryKey: ["dashboard", "pipeline-chart"],
    refetchInterval: DASHBOARD_REFETCH_INTERVAL,
  });

  useEffect(() => {
    setChartReady(true);
  }, []);

  const chartData = useMemo(() => data?.pipeline_by_stage ?? [], [data]);

  return (
    <section className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">
            Pipeline by Stage
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Open value and weighted forecast by stage.
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

      <div className="h-[280px] px-5 pb-5 pt-4">
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : isError || !data ? (
          <div className="flex h-full items-center rounded-lg border border-red-100 bg-red-50/50 p-4 text-sm text-red-700">
            {getErrorMessage(error)}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/40 text-sm text-[var(--muted-foreground)]">
            No pipeline data yet.
          </div>
        ) : chartReady ? (
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={chartData}
              margin={{ bottom: 8, left: 0, right: 8, top: 8 }}
            >
              <CartesianGrid
                stroke="#E2E8F0"
                strokeDasharray="4 4"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="stage"
                fontSize={12}
                interval={0}
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
                content={<PipelineTooltip />}
                cursor={{ fill: "#F8FAFC" }}
              />
              <Bar
                dataKey="total_value"
                fill="#94A3B8"
                name="Total value"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="weighted_value"
                fill="var(--primary)"
                name="Weighted value"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Skeleton className="h-full w-full rounded-lg" />
        )}
      </div>
    </section>
  );
}
