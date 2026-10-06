"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import { chartColors, percent } from "@/components/reports/chart-utils";
import { api } from "@/lib/api";
import type {
  LeadFunnelResponse,
  LeadResponseTimeRow,
  LeadVolumeRow,
} from "@/types/api";

type LeadVolumeGroup = "source" | "campaign" | "week" | "month";

interface LeadResponseReportRow extends LeadResponseTimeRow {
  count?: number;
  lead_count?: number;
}

interface LeadVolumeTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: LeadVolumeRow }>;
}

function LeadVolumeTooltip({ active, payload }: LeadVolumeTooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
      <p className="font-semibold text-[var(--navy)]">
        {item.group || "Unassigned"}
      </p>
      <p className="mt-1 text-[var(--muted-foreground)]">
        {item.count.toLocaleString()} leads
      </p>
    </div>
  );
}

function groupLabel(group: LeadVolumeGroup): string {
  if (group === "source") {
    return "Source";
  }

  if (group === "campaign") {
    return "Campaign";
  }

  if (group === "week") {
    return "Week";
  }

  return "Month";
}

function responseLeadCount(row: LeadResponseReportRow): string {
  const count = row.lead_count ?? row.count;
  return typeof count === "number" ? count.toLocaleString() : "N/A";
}

export function LeadsTab() {
  const [chartReady, setChartReady] = useState(false);
  const [filters, setFilters] = useState<DateRangeFilterValue>(() =>
    defaultDateRange(),
  );
  const [groupBy, setGroupBy] = useState<LeadVolumeGroup>("week");

  useEffect(() => {
    setChartReady(true);
  }, []);

  const leadVolumeQuery = useQuery({
    queryFn: () =>
      api.get<LeadVolumeRow[]>("/reports/lead-volume", {
        date_from: filters.date_from,
        date_to: filters.date_to,
        group_by: groupBy,
      }),
    queryKey: [
      "reports",
      "lead-volume",
      filters.date_from,
      filters.date_to,
      groupBy,
    ],
  });
  const leadFunnelQuery = useQuery({
    queryFn: () => api.get<LeadFunnelResponse>("/reports/lead-funnel"),
    queryKey: ["reports", "lead-funnel"],
  });
  const responseTimeQuery = useQuery({
    queryFn: () =>
      api.get<LeadResponseReportRow[]>("/reports/lead-response-time"),
    queryKey: ["reports", "lead-response-time"],
  });

  const leadVolume = leadVolumeQuery.data ?? [];
  const funnelStages = useMemo(() => {
    const funnel = leadFunnelQuery.data;
    if (!funnel) {
      return [];
    }

    const max = Math.max(
      funnel.total_leads,
      funnel.qualified_leads,
      funnel.won_deals,
      1,
    );
    return [
      {
        color: chartColors.navy,
        label: "Leads",
        rate: 100,
        value: funnel.total_leads,
        width: percent(funnel.total_leads, max),
      },
      {
        color: chartColors.blue,
        label: "Qualified",
        rate: funnel.qualification_rate,
        value: funnel.qualified_leads,
        width: percent(funnel.qualified_leads, max),
      },
      {
        color: chartColors.green,
        label: "Won",
        rate: funnel.win_rate,
        value: funnel.won_deals,
        width: percent(funnel.won_deals, max),
      },
    ];
  }, [leadFunnelQuery.data]);
  const responseRows = responseTimeQuery.data ?? [];

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm">
        <DateRangeFilter
          onApply={setFilters}
          showOwner={false}
          value={filters}
        />
      </section>

      <ReportCard
        actions={
          <>
            <div className="flex rounded-md border border-slate-200 bg-white p-1 shadow-sm">
              {(
                [
                  "source",
                  "campaign",
                  "week",
                  "month",
                ] satisfies LeadVolumeGroup[]
              ).map((option) => (
                <button
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    groupBy === option
                      ? "bg-[var(--navy)] text-white"
                      : "text-[var(--muted-foreground)] hover:bg-slate-50 hover:text-[var(--navy)]"
                  }`}
                  key={option}
                  onClick={() => setGroupBy(option)}
                  type="button"
                >
                  {groupLabel(option)}
                </button>
              ))}
            </div>
            <ExportButtons
              params={{
                date_from: filters.date_from,
                date_to: filters.date_to,
                group_by: groupBy,
              }}
              report="lead-volume"
            />
          </>
        }
        description="Lead count grouped by source, campaign, week, or month."
        empty={leadVolume.length === 0}
        error={leadVolumeQuery.isError}
        isFetching={leadVolumeQuery.isFetching}
        isLoading={leadVolumeQuery.isLoading || !chartReady}
        onRetry={() => void leadVolumeQuery.refetch()}
        title="Lead Volume"
      >
        <div className="h-[300px]">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart
              data={leadVolume}
              margin={{ bottom: 8, left: 0, right: 12, top: 8 }}
            >
              <CartesianGrid stroke="#E2E8F0" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="group"
                fontSize={12}
                tick={{ fill: chartColors.slate }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                allowDecimals={false}
                fontSize={12}
                tick={{ fill: chartColors.slate }}
                tickLine={false}
              />
              <Tooltip content={<LeadVolumeTooltip />} />
              <Legend />
              <Line
                dataKey="count"
                dot={{ fill: chartColors.blue, r: 4 }}
                name="Leads"
                stroke={chartColors.blue}
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ReportCard
          actions={<ExportButtons report="lead-funnel" />}
          description="Lead progression from raw leads to qualified opportunities and won deals."
          empty={funnelStages.length === 0}
          error={leadFunnelQuery.isError}
          isFetching={leadFunnelQuery.isFetching}
          isLoading={leadFunnelQuery.isLoading}
          onRetry={() => void leadFunnelQuery.refetch()}
          skeletonClassName="h-[360px]"
          title="Lead Funnel"
        >
          <div className="grid gap-5">
            {funnelStages.map((stage, index) => (
              <div key={stage.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-[var(--navy)]">
                    {stage.label}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {stage.value.toLocaleString()}
                  </span>
                </div>
                <div className="h-11 overflow-hidden rounded-lg bg-slate-100">
                  <div
                    className="flex h-full items-center justify-end rounded-lg px-3 text-sm font-semibold text-white"
                    style={{
                      backgroundColor: stage.color,
                      width: `${Math.max(stage.width, stage.value > 0 ? 8 : 0)}%`,
                    }}
                  >
                    {stage.value > 0 ? `${stage.rate}%` : ""}
                  </div>
                </div>
                {index < funnelStages.length - 1 ? (
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    Conversion to next stage:{" "}
                    {index === 0
                      ? (leadFunnelQuery.data?.qualification_rate ?? 0)
                      : (leadFunnelQuery.data?.win_rate ?? 0)}
                    %
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard
          actions={<ExportButtons report="lead-response-time" />}
          description="Average time from lead creation to first activity by rep."
          empty={responseRows.length === 0}
          error={responseTimeQuery.isError}
          isFetching={responseTimeQuery.isFetching}
          isLoading={responseTimeQuery.isLoading}
          onRetry={() => void responseTimeQuery.refetch()}
          skeletonClassName="h-[360px]"
          title="Lead Response Time"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2">Rep</th>
                  <th className="px-3 py-2">Avg Hours</th>
                  <th className="px-3 py-2">Lead Count</th>
                </tr>
              </thead>
              <tbody>
                {responseRows.map((row) => (
                  <tr
                    className="border-t border-slate-100"
                    key={row.rep_id ?? row.rep_name ?? "unknown"}
                  >
                    <td className="px-3 py-3 font-medium text-[var(--navy)]">
                      {row.rep_name ?? "Unassigned"}
                    </td>
                    <td className="px-3 py-3">
                      {row.avg_hours === null || row.avg_hours === undefined
                        ? "N/A"
                        : `${Math.round(row.avg_hours * 10) / 10}h`}
                    </td>
                    <td className="px-3 py-3">{responseLeadCount(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportCard>
      </div>
    </div>
  );
}
