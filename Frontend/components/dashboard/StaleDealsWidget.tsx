"use client";

import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { RefreshCcw } from "lucide-react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import type { ApiErrorPayload, Deal } from "@/types/api";

const DASHBOARD_REFETCH_INTERVAL = 300000;

function getErrorMessage(error: unknown): string {
  const apiError = error as Partial<ApiErrorPayload>;
  return typeof apiError.detail === "string"
    ? apiError.detail
    : "Could not load stale deals.";
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function daysSinceUpdate(deal: Deal): number {
  return Math.max(
    14,
    differenceInCalendarDays(new Date(), new Date(deal.updated_at)),
  );
}

function StaleDealsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((item) => (
        <div className="rounded-lg border border-slate-200/70 p-3" key={item}>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-2 h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

export function StaleDealsWidget() {
  const { data, error, isError, isLoading, isFetching, refetch } = useQuery({
    queryFn: () => api.get<Deal[]>("/deals/stale", { days: 14, page_size: 5 }),
    queryKey: ["dashboard", "stale-deals"],
    refetchInterval: DASHBOARD_REFETCH_INTERVAL,
  });

  const deals = (data ?? []).slice(0, 5);

  return (
    <section className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">
            Stale Deals
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Deals with no recent activity in 14+ days.
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

      <div className="p-5">
        {isLoading ? (
          <StaleDealsSkeleton />
        ) : isError ? (
          <div className="rounded-lg border border-red-100 bg-red-50/50 p-4 text-sm text-red-700">
            {getErrorMessage(error)}
          </div>
        ) : deals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center text-sm text-[var(--muted-foreground)]">
            No stale deals right now.
          </div>
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => (
              <Link
                className="grid gap-3 rounded-lg border border-slate-200/70 bg-white px-3 py-3 transition-colors hover:border-slate-300/80 hover:bg-slate-50/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                href={`/deals/${deal.id}`}
                key={deal.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--navy)]">
                    {deal.title}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
                    <span>{deal.account_name ?? "No account"}</span>
                    <span className="text-slate-300">/</span>
                    <span>{deal.owner_name ?? "Unassigned"}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 text-right sm:block">
                  <p className="text-sm font-semibold text-[var(--navy)]">
                    {formatCurrency(toNumber(deal.value), deal.currency)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {daysSinceUpdate(deal)} days quiet
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
