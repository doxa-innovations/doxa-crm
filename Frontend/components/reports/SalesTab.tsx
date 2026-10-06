"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  DateRangeFilter,
  defaultDateRange,
  type DateRangeFilterValue,
} from "@/components/reports/DateRangeFilter";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { ReportCard } from "@/components/reports/ReportCard";
import { chartColors, formatMonth } from "@/components/reports/chart-utils";
import { api } from "@/lib/api";
import { formatReportCurrency } from "@/lib/utils";
import type {
  DealVelocityRow,
  ForecastMonthRow,
  Pipeline,
  PipelineSummaryRow,
  WinLossRow,
} from "@/types/api";

interface WinLossSummaryRow {
  group: string;
  lost_count: number;
  lost_value: number;
  won_count: number;
  won_value: number;
}

interface DonutRow {
  fill: string;
  name: string;
  value: number;
}

interface PipelineTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PipelineSummaryRow }>;
}

interface ForecastTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ForecastMonthRow }>;
}

interface VelocityTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DealVelocityRow }>;
}

function exportParams(filters: DateRangeFilterValue, pipelineId: string) {
  return {
    date_from: filters.date_from,
    date_to: filters.date_to,
    owner_id: filters.owner_id,
    pipeline_id: pipelineId,
  };
}

function statusKey(status: string): "won" | "lost" | "other" {
  const normalized = status.toLowerCase();
  if (normalized.includes("won")) {
    return "won";
  }

  if (normalized.includes("lost")) {
    return "lost";
  }

  return "other";
}

function buildWinLossRows(rows: WinLossRow[]): WinLossSummaryRow[] {
  const byGroup = new Map<string, WinLossSummaryRow>();

  rows.forEach((row) => {
    const group = row.group || "Unassigned";
    const existing =
      byGroup.get(group) ??
      ({
        group,
        lost_count: 0,
        lost_value: 0,
        won_count: 0,
        won_value: 0,
      } satisfies WinLossSummaryRow);
    const key = statusKey(row.status);

    if (key === "won") {
      existing.won_count += row.count;
      existing.won_value += row.value;
    } else if (key === "lost") {
      existing.lost_count += row.count;
      existing.lost_value += row.value;
    }

    byGroup.set(group, existing);
  });

  return Array.from(byGroup.values());
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

function ForecastTooltip({ active, payload }: ForecastTooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
      <p className="font-semibold text-[var(--navy)]">
        {formatMonth(item.month)}
      </p>
      <p className="mt-1 text-[var(--muted-foreground)]">Deals: {item.count}</p>
      <p className="text-[var(--muted-foreground)]">
        Open: {formatReportCurrency(item.open_value)}
      </p>
      <p className="font-medium text-[var(--primary)]">
        Weighted: {formatReportCurrency(item.weighted_value)}
      </p>
    </div>
  );
}

function VelocityTooltip({ active, payload }: VelocityTooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
      <p className="font-semibold text-[var(--navy)]">{item.stage}</p>
      <p className="mt-1 text-[var(--muted-foreground)]">
        {Math.round(item.avg_days * 10) / 10} days average
      </p>
    </div>
  );
}

function tooltipCurrency(value: unknown): string {
  return typeof value === "number"
    ? formatReportCurrency(value)
    : String(value ?? "");
}

export function SalesTab() {
  const [chartReady, setChartReady] = useState(false);
  const [filters, setFilters] = useState<DateRangeFilterValue>(() =>
    defaultDateRange(),
  );
  const [pipelineId, setPipelineId] = useState("");

  useEffect(() => {
    setChartReady(true);
  }, []);

  const pipelinesQuery = useQuery({
    queryFn: () => api.get<Pipeline[]>("/pipelines/"),
    queryKey: ["pipelines", "reports"],
  });
  const pipelineSummaryQuery = useQuery({
    queryFn: () =>
      api.get<PipelineSummaryRow[]>(
        "/reports/pipeline-summary",
        exportParams(filters, pipelineId),
      ),
    queryKey: ["reports", "pipeline-summary", filters, pipelineId],
  });
  const winLossQuery = useQuery({
    queryFn: () =>
      api.get<WinLossRow[]>("/reports/win-loss", {
        ...exportParams(filters, pipelineId),
        group_by: "owner",
      }),
    queryKey: ["reports", "win-loss", "owner", filters, pipelineId],
  });
  const forecastQuery = useQuery({
    queryFn: () =>
      api.get<ForecastMonthRow[]>(
        "/reports/forecast",
        exportParams(filters, pipelineId),
      ),
    queryKey: ["reports", "forecast", filters, pipelineId],
  });
  const velocityQuery = useQuery({
    queryFn: () =>
      api.get<DealVelocityRow[]>("/reports/deal-velocity", {
        date_from: filters.date_from,
        date_to: filters.date_to,
        pipeline_id: pipelineId || undefined,
      }),
    queryKey: [
      "reports",
      "deal-velocity",
      filters.date_from,
      filters.date_to,
      pipelineId,
    ],
  });

  const pipelineSummary = pipelineSummaryQuery.data ?? [];
  const winLossRows = useMemo(
    () => buildWinLossRows(winLossQuery.data ?? []),
    [winLossQuery.data],
  );
  const winLossCountData = useMemo<DonutRow[]>(
    () => [
      {
        fill: chartColors.green,
        name: "Won",
        value: winLossRows.reduce((sum, row) => sum + row.won_count, 0),
      },
      {
        fill: chartColors.red,
        name: "Lost",
        value: winLossRows.reduce((sum, row) => sum + row.lost_count, 0),
      },
    ],
    [winLossRows],
  );
  const winLossValueData = useMemo<DonutRow[]>(
    () => [
      {
        fill: chartColors.green,
        name: "Won",
        value: winLossRows.reduce((sum, row) => sum + row.won_value, 0),
      },
      {
        fill: chartColors.red,
        name: "Lost",
        value: winLossRows.reduce((sum, row) => sum + row.lost_value, 0),
      },
    ],
    [winLossRows],
  );
  const forecast = forecastQuery.data ?? [];
  const velocity = velocityQuery.data ?? [];
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <select
            className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950 shadow-sm md:max-w-sm"
            onChange={(event) => setPipelineId(event.target.value)}
            value={pipelineId}
          >
            <option value="">All pipelines</option>
            {(pipelinesQuery.data ?? []).map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </div>
        <DateRangeFilter onApply={setFilters} value={filters} />
      </section>

      <ReportCard
        actions={
          <ExportButtons
            params={exportParams(filters, pipelineId)}
            report="pipeline-summary"
          />
        }
        description="Deals by stage with count, total value, and weighted value."
        empty={pipelineSummary.length === 0}
        error={pipelineSummaryQuery.isError}
        isFetching={pipelineSummaryQuery.isFetching}
        isLoading={pipelineSummaryQuery.isLoading || !chartReady}
        onRetry={() => void pipelineSummaryQuery.refetch()}
        title="Pipeline Summary"
      >
        <div className="h-[320px]">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={pipelineSummary}
              margin={{ bottom: 8, left: 0, right: 8, top: 8 }}
            >
              <CartesianGrid stroke="#E2E8F0" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="stage"
                fontSize={12}
                tick={{ fill: chartColors.slate }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                fontSize={12}
                tick={{ fill: chartColors.slate }}
                tickLine={false}
                yAxisId="count"
              />
              <YAxis
                axisLine={false}
                fontSize={12}
                orientation="right"
                tick={{ fill: chartColors.slate }}
                tickFormatter={(value: number) =>
                  `$${Math.round(value / 1000)}k`
                }
                tickLine={false}
                yAxisId="value"
              />
              <Tooltip
                content={<PipelineTooltip />}
                cursor={{ fill: chartColors.sky }}
              />
              <Legend />
              <Bar
                dataKey="count"
                fill={chartColors.navy}
                name="Deal count"
                radius={[6, 6, 0, 0]}
                yAxisId="count"
              />
              <Bar
                dataKey="total_value"
                fill={chartColors.blueSoft}
                name="Total value"
                radius={[6, 6, 0, 0]}
                yAxisId="value"
              />
              <Bar
                dataKey="weighted_value"
                fill={chartColors.blue}
                name="Weighted value"
                radius={[6, 6, 0, 0]}
                yAxisId="value"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <ReportCard
        actions={
          <ExportButtons
            params={{ ...exportParams(filters, pipelineId), group_by: "owner" }}
            report="win-loss"
          />
        }
        description="Closed-won vs closed-lost deals by count and value."
        empty={winLossRows.length === 0}
        error={winLossQuery.isError}
        isFetching={winLossQuery.isFetching}
        isLoading={winLossQuery.isLoading || !chartReady}
        onRetry={() => void winLossQuery.refetch()}
        skeletonClassName="h-[420px]"
        title="Win/Loss Analysis"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-[220px]">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Tooltip />
                <Pie
                  data={winLossCountData}
                  dataKey="value"
                  innerRadius={55}
                  nameKey="name"
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {winLossCountData.map((entry) => (
                    <Cell fill={entry.fill} key={entry.name} />
                  ))}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center text-sm font-medium text-[var(--navy)]">
              By Count
            </p>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Tooltip formatter={tooltipCurrency} />
                <Pie
                  data={winLossValueData}
                  dataKey="value"
                  innerRadius={55}
                  nameKey="name"
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {winLossValueData.map((entry) => (
                    <Cell fill={entry.fill} key={entry.name} />
                  ))}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center text-sm font-medium text-[var(--navy)]">
              By Value
            </p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Won</th>
                <th className="px-3 py-2">Lost</th>
                <th className="px-3 py-2">Won Value</th>
                <th className="px-3 py-2">Lost Value</th>
              </tr>
            </thead>
            <tbody>
              {winLossRows.map((row) => (
                <tr className="border-t border-slate-100" key={row.group}>
                  <td className="px-3 py-3 font-medium text-[var(--navy)]">
                    {row.group}
                  </td>
                  <td className="px-3 py-3 text-emerald-700">
                    {row.won_count}
                  </td>
                  <td className="px-3 py-3 text-red-700">{row.lost_count}</td>
                  <td className="px-3 py-3">
                    {formatReportCurrency(row.won_value)}
                  </td>
                  <td className="px-3 py-3">
                    {formatReportCurrency(row.lost_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportCard
          actions={
            <ExportButtons
              params={exportParams(filters, pipelineId)}
              report="forecast"
            />
          }
          description="Weighted monthly forecast for the selected expected-close range."
          empty={forecast.length === 0}
          error={forecastQuery.isError}
          isFetching={forecastQuery.isFetching}
          isLoading={forecastQuery.isLoading || !chartReady}
          onRetry={() => void forecastQuery.refetch()}
          title="Revenue Forecast"
        >
          <div className="h-[280px]">
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart
                data={forecast}
                margin={{ bottom: 8, left: 0, right: 8, top: 8 }}
              >
                <defs>
                  <linearGradient id="forecastFill" x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={chartColors.blue}
                      stopOpacity={0.28}
                    />
                    <stop
                      offset="95%"
                      stopColor={chartColors.blue}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E2E8F0" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="month"
                  fontSize={12}
                  tick={{ fill: chartColors.slate }}
                  tickFormatter={formatMonth}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  fontSize={12}
                  tick={{ fill: chartColors.slate }}
                  tickFormatter={(value: number) =>
                    `$${Math.round(value / 1000)}k`
                  }
                  tickLine={false}
                />
                <Tooltip content={<ForecastTooltip />} />
                <ReferenceLine
                  label="Current"
                  stroke={chartColors.amber}
                  strokeDasharray="4 4"
                  x={currentMonth}
                />
                <Area
                  dataKey="weighted_value"
                  fill="url(#forecastFill)"
                  name="Weighted value"
                  stroke={chartColors.blue}
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ReportCard>

        <ReportCard
          actions={
            <ExportButtons
              params={{
                date_from: filters.date_from,
                date_to: filters.date_to,
                pipeline_id: pipelineId,
              }}
              report="deal-velocity"
            />
          }
          description="Average days spent in each pipeline stage."
          empty={velocity.length === 0}
          error={velocityQuery.isError}
          isFetching={velocityQuery.isFetching}
          isLoading={velocityQuery.isLoading || !chartReady}
          onRetry={() => void velocityQuery.refetch()}
          title="Deal Velocity"
        >
          <div className="h-[280px]">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={velocity}
                layout="vertical"
                margin={{ bottom: 8, left: 0, right: 24, top: 8 }}
              >
                <CartesianGrid horizontal={false} stroke="#E2E8F0" />
                <XAxis
                  axisLine={false}
                  fontSize={12}
                  tick={{ fill: chartColors.slate }}
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  dataKey="stage"
                  fontSize={12}
                  tick={{ fill: chartColors.slate }}
                  tickLine={false}
                  type="category"
                  width={118}
                />
                <Tooltip
                  content={<VelocityTooltip />}
                  cursor={{ fill: chartColors.sky }}
                />
                <Bar
                  dataKey="avg_days"
                  fill={chartColors.blue}
                  name="Average days"
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ReportCard>
      </div>
    </div>
  );
}
