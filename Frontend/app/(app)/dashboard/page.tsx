import { ReportingCurrency } from "@/components/reports/ReportingCurrency";
import { format } from "date-fns";
import { Suspense } from "react";

import { LeadFunnelChart } from "@/components/dashboard/LeadFunnelChart";
import { OverdueTasksList } from "@/components/dashboard/OverdueTasksList";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { StaleDealsWidget } from "@/components/dashboard/StaleDealsWidget";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

function StatsFallback() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {["open", "leads", "tasks", "activities"].map((item) => (
        <div
          className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm"
          key={item}
        >
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-4 h-4 w-32" />
        </div>
      ))}
    </section>
  );
}

function ChartFallback() {
  return (
    <div className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="p-5">
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </div>
    </div>
  );
}

function ListFallback() {
  return (
    <div className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="space-y-3 p-5">
        {[1, 2, 3].map((item) => (
          <Skeleton className="h-16 w-full rounded-lg" key={item} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const today = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-2 border-b border-slate-200/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-normal text-[var(--navy)]">
          Dashboard
        </h1>
        <time
          className="text-sm font-medium text-[var(--muted-foreground)]"
          dateTime={new Date().toISOString()}
        >
          {today}
        </time>
      </header>
      <ReportingCurrency />

      <Suspense fallback={<StatsFallback />}>
        <StatsRow />
      </Suspense>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
        <Suspense fallback={<ChartFallback />}>
          <PipelineChart />
        </Suspense>
        <Suspense fallback={<ChartFallback />}>
          <LeadFunnelChart />
        </Suspense>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Suspense fallback={<ListFallback />}>
          <OverdueTasksList />
        </Suspense>
        <Suspense fallback={<ListFallback />}>
          <StaleDealsWidget />
        </Suspense>
      </section>
    </div>
  );
}
