"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  UserPlus,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatReportCurrency } from "@/lib/utils";
import type { ApiErrorPayload, DashboardResponse } from "@/types/api";

const DASHBOARD_REFETCH_INTERVAL = 300000;

function getErrorMessage(error: unknown): string {
  const apiError = error as Partial<ApiErrorPayload>;
  return typeof apiError.detail === "string"
    ? apiError.detail
    : "Could not load dashboard stats.";
}

function StatsRowSkeleton() {
  return (
    <section
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      aria-label="Loading dashboard stats"
    >
      {["open-deals", "leads", "overdue", "activities"].map((item) => (
        <div
          className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm"
          key={item}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-20" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
          <Skeleton className="mt-4 h-4 w-32" />
        </div>
      ))}
    </section>
  );
}

export function StatsRow() {
  const { data, error, isError, isLoading, isFetching, refetch } = useQuery({
    queryFn: () => api.get<DashboardResponse>("/reports/dashboard"),
    queryKey: ["dashboard", "stats"],
    refetchInterval: DASHBOARD_REFETCH_INTERVAL,
  });

  if (isLoading) {
    return <StatsRowSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{getErrorMessage(error)}</span>
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
        </div>
      </div>
    );
  }

  const leadsDelta = data.leads_this_month - data.leads_last_month;
  const hasMoreLeads = leadsDelta > 0;
  const hasFewerLeads = leadsDelta < 0;
  const leadTrendText =
    leadsDelta === 0
      ? "Same as last month"
      : `${Math.abs(leadsDelta)} ${hasMoreLeads ? "more" : "fewer"} than last month`;
  const LeadTrendIcon = hasFewerLeads ? TrendingDown : TrendingUp;

  const stats = [
    {
      accent: "border-emerald-100 bg-emerald-50 text-emerald-700",
      icon: BadgeDollarSign,
      label: "Open Deals",
      trend: formatReportCurrency(data.open_deals_value),
      value: data.open_deals_count.toLocaleString(),
      valueClassName: "text-[var(--navy)]",
    },
    {
      accent: "border-sky-100 bg-sky-50 text-sky-700",
      icon: UserPlus,
      label: "Leads This Month",
      trend: leadTrendText,
      trendIcon: LeadTrendIcon,
      trendTone: hasFewerLeads
        ? "text-red-600"
        : hasMoreLeads
          ? "text-emerald-700"
          : "text-slate-500",
      value: data.leads_this_month.toLocaleString(),
      valueClassName: "text-[var(--navy)]",
    },
    {
      accent:
        data.overdue_tasks_count > 0
          ? "border-red-100 bg-red-50 text-red-600"
          : "border-slate-200 bg-slate-50 text-slate-500",
      icon: AlertTriangle,
      label: "Overdue Tasks",
      trend: data.overdue_tasks_count > 0 ? "Needs attention" : "All clear",
      value: data.overdue_tasks_count.toLocaleString(),
      valueClassName:
        data.overdue_tasks_count > 0 ? "text-red-600" : "text-[var(--navy)]",
    },
    {
      accent: "border-violet-100 bg-violet-50 text-violet-700",
      icon: Activity,
      label: "Activities This Week",
      trend: "Logged CRM touchpoints",
      value: data.activities_this_week.toLocaleString(),
      valueClassName: "text-[var(--navy)]",
    },
  ];

  return (
    <section
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      aria-label="Dashboard stats"
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        const TrendIcon = stat.trendIcon;

        return (
          <article
            className="min-h-[150px] rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm transition-colors hover:border-slate-300/80"
            key={stat.label}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  {stat.label}
                </p>
                <p
                  className={cn(
                    "mt-2 text-3xl font-semibold tracking-normal",
                    stat.valueClassName,
                  )}
                >
                  {stat.value}
                </p>
              </div>
              <div
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
                  stat.accent,
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
            <div
              className={cn(
                "mt-5 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium",
                stat.trendTone ?? "text-[var(--muted-foreground)]",
              )}
            >
              {TrendIcon ? (
                <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
              ) : null}
              <span>{stat.trend}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
