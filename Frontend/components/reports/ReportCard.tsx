"use client";

import { RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ReportCardProps {
  actions?: ReactNode;
  children: ReactNode;
  description?: string;
  empty?: boolean;
  error?: boolean;
  isFetching?: boolean;
  isLoading?: boolean;
  noDataText?: string;
  onRetry?: () => void;
  skeletonClassName?: string;
  title: string;
}

export function ReportCard({
  actions,
  children,
  description,
  empty,
  error,
  isFetching,
  isLoading,
  noDataText = "No data for this period.",
  onRetry,
  skeletonClassName = "h-[280px]",
  title,
}: ReportCardProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--navy)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--muted-foreground)]">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {actions}
          {error && onRetry ? (
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              <RefreshCcw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
                aria-hidden="true"
              />
              Retry
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-5 [&_tbody_tr:hover]:bg-slate-50/70 [&_thead]:bg-slate-50/80">
        {isLoading ? (
          <Skeleton className={cn("w-full rounded-xl", skeletonClassName)} />
        ) : null}
        {!isLoading && error ? (
          <div
            className={cn(
              "flex items-center rounded-xl border border-red-100 bg-red-50/50 p-4 text-sm text-red-700",
              skeletonClassName,
            )}
          >
            Could not load this report.
          </div>
        ) : null}
        {!isLoading && !error && empty ? (
          <div
            className={cn(
              "flex items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-[var(--muted-foreground)]",
              skeletonClassName,
            )}
          >
            {noDataText}
          </div>
        ) : null}
        {!isLoading && !error && !empty ? children : null}
      </div>
    </section>
  );
}
