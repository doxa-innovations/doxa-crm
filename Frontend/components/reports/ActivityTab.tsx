"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { chartColors, daysOverdue } from "@/components/reports/chart-utils";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { ActivityVolumeRow, OverdueTaskRow } from "@/types/api";

interface ActivityChartRow {
  calls: number;
  emails: number;
  meetings: number;
  notes: number;
  rep: string;
  tasks: number;
}

interface OverdueTaskReportRow extends OverdueTaskRow {
  linked_to?: string | null;
  linked_type?: string | null;
}

function emptyActivityRow(rep: string): ActivityChartRow {
  return {
    calls: 0,
    emails: 0,
    meetings: 0,
    notes: 0,
    rep,
    tasks: 0,
  };
}

function activityKey(type: string): keyof Omit<ActivityChartRow, "rep"> {
  const normalized = type.toLowerCase();
  if (normalized.includes("call")) {
    return "calls";
  }

  if (normalized.includes("email")) {
    return "emails";
  }

  if (normalized.includes("meeting")) {
    return "meetings";
  }

  if (normalized.includes("task")) {
    return "tasks";
  }

  return "notes";
}

function buildActivityRows(
  rows: ActivityVolumeRow[],
  ownerId: string,
): ActivityChartRow[] {
  const byRep = new Map<string, ActivityChartRow>();
  rows
    .filter((row) => !ownerId || row.rep_id === ownerId)
    .forEach((row) => {
      const rep = row.rep_name ?? "Unassigned";
      const existing = byRep.get(rep) ?? emptyActivityRow(rep);
      const key = activityKey(row.activity_type);
      existing[key] += row.count;
      byRep.set(rep, existing);
    });

  return Array.from(byRep.values());
}

function linkedLabel(row: OverdueTaskReportRow): string {
  if (row.linked_to) {
    return row.linked_type
      ? `${row.linked_type}: ${row.linked_to}`
      : row.linked_to;
  }

  return "Not linked";
}

export function ActivityTab() {
  const [chartReady, setChartReady] = useState(false);
  const [filters, setFilters] = useState<DateRangeFilterValue>(() =>
    defaultDateRange(),
  );

  useEffect(() => {
    setChartReady(true);
  }, []);

  const activityVolumeQuery = useQuery({
    queryFn: () =>
      api.get<ActivityVolumeRow[]>("/reports/activity-volume", {
        date_from: filters.date_from,
        date_to: filters.date_to,
      }),
    queryKey: [
      "reports",
      "activity-volume",
      filters.date_from,
      filters.date_to,
    ],
  });
  const overdueTasksQuery = useQuery({
    queryFn: () => api.get<OverdueTaskReportRow[]>("/reports/overdue-tasks"),
    queryKey: ["reports", "overdue-tasks"],
  });

  const activityRows = useMemo(
    () => buildActivityRows(activityVolumeQuery.data ?? [], filters.owner_id),
    [activityVolumeQuery.data, filters.owner_id],
  );
  const overdueTasks = overdueTasksQuery.data ?? [];

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm">
        <DateRangeFilter
          onApply={setFilters}
          ownerLabel="Rep"
          value={filters}
        />
      </section>

      <ReportCard
        actions={
          <ExportButtons
            params={{ date_from: filters.date_from, date_to: filters.date_to }}
            report="activity-volume"
          />
        }
        description="Activity counts by type and rep for the selected date range."
        empty={activityRows.length === 0}
        error={activityVolumeQuery.isError}
        isFetching={activityVolumeQuery.isFetching}
        isLoading={activityVolumeQuery.isLoading || !chartReady}
        onRetry={() => void activityVolumeQuery.refetch()}
        title="Activity Volume"
      >
        <div className="h-[320px]">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={activityRows}
              margin={{ bottom: 8, left: 0, right: 8, top: 8 }}
            >
              <CartesianGrid stroke="#E2E8F0" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="rep"
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
              <Tooltip cursor={{ fill: chartColors.sky }} />
              <Legend />
              <Bar
                dataKey="calls"
                fill={chartColors.blue}
                name="Calls"
                radius={[5, 5, 0, 0]}
              />
              <Bar
                dataKey="emails"
                fill={chartColors.green}
                name="Emails"
                radius={[5, 5, 0, 0]}
              />
              <Bar
                dataKey="meetings"
                fill={chartColors.amber}
                name="Meetings"
                radius={[5, 5, 0, 0]}
              />
              <Bar
                dataKey="notes"
                fill={chartColors.navy}
                name="Notes"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <ReportCard
        actions={<ExportButtons report="overdue-tasks" />}
        description="Currently overdue tasks sorted by due date."
        empty={overdueTasks.length === 0}
        error={overdueTasksQuery.isError}
        isFetching={overdueTasksQuery.isFetching}
        isLoading={overdueTasksQuery.isLoading}
        onRetry={() => void overdueTasksQuery.refetch()}
        skeletonClassName="h-[360px]"
        title="Overdue Tasks"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Due Date</th>
                <th className="px-3 py-2">Days Overdue</th>
                <th className="px-3 py-2">Linked To</th>
              </tr>
            </thead>
            <tbody>
              {overdueTasks.map((task) => (
                <tr className="border-t border-slate-100" key={task.id}>
                  <td className="px-3 py-3 font-medium text-[var(--navy)]">
                    {task.title}
                  </td>
                  <td className="px-3 py-3">
                    {task.assignee_name ?? "Unassigned"}
                  </td>
                  <td className="px-3 py-3 text-red-700">
                    {formatDate(task.due_at)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                      {daysOverdue(task.due_at)} days
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[var(--muted-foreground)]">
                    {linkedLabel(task)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>
    </div>
  );
}
