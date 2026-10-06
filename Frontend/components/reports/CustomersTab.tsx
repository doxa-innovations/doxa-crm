"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ExportButtons } from "@/components/reports/ExportButtons";
import { ReportCard } from "@/components/reports/ReportCard";
import { chartColors } from "@/components/reports/chart-utils";
import { api } from "@/lib/api";
import { cn, formatReportCurrency, formatDate } from "@/lib/utils";
import type { CustomerHealthRow, RenewalPipelineRow } from "@/types/api";

type HealthFilter = "" | "green" | "yellow" | "red";

const healthLabels: Record<Exclude<HealthFilter, "">, string> = {
  green: "On Track",
  red: "Delayed",
  yellow: "At Risk",
};

const healthColors: Record<Exclude<HealthFilter, "">, string> = {
  green: chartColors.green,
  red: chartColors.red,
  yellow: chartColors.amber,
};

function normalizeHealth(health: string): Exclude<HealthFilter, ""> {
  if (health === "red" || health === "yellow" || health === "green") {
    return health;
  }

  return "green";
}

export function CustomersTab() {
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("");
  const customerHealthQuery = useQuery({
    queryFn: () => api.get<CustomerHealthRow[]>("/reports/customer-health"),
    queryKey: ["reports", "customer-health"],
  });
  const renewalPipelineQuery = useQuery({
    queryFn: () => api.get<RenewalPipelineRow[]>("/reports/renewal-pipeline"),
    queryKey: ["reports", "renewal-pipeline"],
  });

  const customerRows = customerHealthQuery.data ?? [];
  const filteredCustomerRows = healthFilter
    ? customerRows.filter((row) => normalizeHealth(row.health) === healthFilter)
    : customerRows;
  const healthCounts = useMemo(
    () => ({
      green: customerRows.filter(
        (row) => normalizeHealth(row.health) === "green",
      ).length,
      red: customerRows.filter((row) => normalizeHealth(row.health) === "red")
        .length,
      yellow: customerRows.filter(
        (row) => normalizeHealth(row.health) === "yellow",
      ).length,
    }),
    [customerRows],
  );
  const renewalRows = renewalPipelineQuery.data ?? [];

  return (
    <div className="grid gap-6">
      <ReportCard
        actions={<ExportButtons report="customer-health" />}
        description="Current customer project health with filterable status cards."
        empty={customerRows.length === 0}
        error={customerHealthQuery.isError}
        isFetching={customerHealthQuery.isFetching}
        isLoading={customerHealthQuery.isLoading}
        onRetry={() => void customerHealthQuery.refetch()}
        skeletonClassName="h-[420px]"
        title="Customer Health Overview"
      >
        <div className="grid gap-3 md:grid-cols-3">
          {(
            ["green", "yellow", "red"] satisfies Array<
              Exclude<HealthFilter, "">
            >
          ).map((health) => (
            <button
              className={cn(
                "rounded-lg border bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50",
                healthFilter === health
                  ? "border-[var(--navy)] ring-2 ring-[var(--navy)]/10"
                  : "border-slate-200",
              )}
              key={health}
              onClick={() =>
                setHealthFilter((current) => (current === health ? "" : health))
              }
              type="button"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: healthColors[health] }}
                />
                <span className="text-sm font-medium text-[var(--muted-foreground)]">
                  {healthLabels[health]}
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold text-[var(--navy)]">
                {healthCounts[health]}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Health</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomerRows.map((row) => {
                const health = normalizeHealth(row.health);
                return (
                  <tr
                    className="border-t border-slate-100"
                    key={row.project_id}
                  >
                    <td className="px-3 py-3">
                      <Link
                        className="font-semibold text-[var(--navy)] hover:text-[var(--primary)]"
                        href={`/projects/${row.project_id}`}
                      >
                        {row.project_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      {row.account_name ?? "Account"}
                    </td>
                    <td className="px-3 py-3">
                      {row.owner_name ?? "Unassigned"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-[var(--navy)]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: healthColors[health] }}
                        />
                        {healthLabels[health]}
                      </span>
                    </td>
                    <td className="px-3 py-3 capitalize">{row.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ReportCard>

      <ReportCard
        actions={<ExportButtons report="renewal-pipeline" />}
        description="Open renewal deals currently in the sales pipeline."
        empty={renewalRows.length === 0}
        error={renewalPipelineQuery.isError}
        isFetching={renewalPipelineQuery.isFetching}
        isLoading={renewalPipelineQuery.isLoading}
        onRetry={() => void renewalPipelineQuery.refetch()}
        skeletonClassName="h-[360px]"
        title="Renewal Pipeline"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Deal</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Weighted</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Expected Close</th>
                <th className="px-3 py-2">Owner</th>
              </tr>
            </thead>
            <tbody>
              {renewalRows.map((row) => (
                <tr className="border-t border-slate-100" key={row.deal_id}>
                  <td className="px-3 py-3">
                    <Link
                      className="font-semibold text-[var(--navy)] hover:text-[var(--primary)]"
                      href={`/deals/${row.deal_id}`}
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-3 py-3">{row.account_name ?? "Account"}</td>
                  <td className="px-3 py-3">
                    {formatReportCurrency(row.value)}
                  </td>
                  <td className="px-3 py-3">
                    {formatReportCurrency(row.weighted_value)}
                  </td>
                  <td className="px-3 py-3">{row.stage ?? "Stage"}</td>
                  <td className="px-3 py-3">
                    {formatDate(row.expected_close)}
                  </td>
                  <td className="px-3 py-3">
                    {row.owner_name ?? "Unassigned"}
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
