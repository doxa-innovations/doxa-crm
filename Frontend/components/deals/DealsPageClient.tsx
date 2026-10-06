"use client";
import { useListState } from "@/hooks/useListState";
import { SavedViews } from "@/components/shared/SavedViews";

import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, List, Plus, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DealForm } from "@/components/deals/DealForm";
import { ForecastChart } from "@/components/deals/ForecastChart";
import { KanbanBoard } from "@/components/deals/KanbanBoard";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type {
  Deal,
  DealForecastResponse,
  DealKanbanResponse,
  Pipeline,
} from "@/types/api";

type ViewMode = "kanban" | "list";

const PAGE_SIZE = 100;
const STORAGE_KEY = "doxa:last-pipeline-id";

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function DealsPageClient() {
  const { canWriteDeals } = usePermissions();
  const { filters, setFilters, page, setPage } = useListState<{
    pipeline_id: string;
    view: ViewMode;
    currency: string;
  }>({ pipeline_id: "", view: "kanban", currency: "USD" });
  const selectedPipelineId = filters.pipeline_id;
  const setSelectedPipelineId = (pipeline_id: string) =>
    setFilters((current) => ({ ...current, pipeline_id }));
  const viewMode = filters.view;
  const setViewMode = (view: ViewMode) =>
    setFilters((current) => ({ ...current, view }));
  const currency = filters.currency;
  const setCurrency = (currency: string) =>
    setFilters((current) => ({ ...current, currency }));
  const [formOpen, setFormOpen] = useState(false);

  const pipelinesQuery = useQuery({
    queryFn: () => api.get<Pipeline[]>("/pipelines/"),
    queryKey: ["pipelines", "deals-page"],
  });
  const pipelines = pipelinesQuery.data ?? [];

  useEffect(() => {
    if (selectedPipelineId || pipelines.length === 0) {
      return;
    }

    const storedPipelineId = window.localStorage.getItem(STORAGE_KEY);
    const storedPipeline = pipelines.find(
      (pipeline) => pipeline.id === storedPipelineId,
    );
    const defaultPipeline =
      storedPipeline ??
      pipelines.find((pipeline) => pipeline.is_default) ??
      pipelines[0];
    setSelectedPipelineId(defaultPipeline.id);
  }, [pipelines, selectedPipelineId]);

  function selectPipeline(pipelineId: string) {
    setPage(1);
    setSelectedPipelineId(pipelineId);
    window.localStorage.setItem(STORAGE_KEY, pipelineId);
  }

  const kanbanQuery = useQuery({
    enabled: Boolean(selectedPipelineId),
    queryFn: () =>
      api.get<DealKanbanResponse>("/deals/kanban", {
        page,
        page_size: PAGE_SIZE,
        pipeline_id: selectedPipelineId,
      }),
    queryKey: ["deals", "kanban", selectedPipelineId, page],
  });
  const forecastQuery = useQuery({
    enabled: Boolean(selectedPipelineId),
    queryFn: () =>
      api.get<DealForecastResponse>("/deals/forecast", {
        pipeline_id: selectedPipelineId,
        currency,
      }),
    queryKey: ["deals", "forecast", selectedPipelineId, currency],
  });
  const dealsQuery = useQuery({
    enabled: Boolean(selectedPipelineId),
    queryFn: () =>
      api.get<Deal[]>("/deals/", {
        page,
        page_size: PAGE_SIZE,
        pipeline_id: selectedPipelineId,
      }),
    queryKey: ["deals", "list", selectedPipelineId, page],
  });

  const detailsById = useMemo(
    () => new Map((dealsQuery.data ?? []).map((deal) => [deal.id, deal])),
    [dealsQuery.data],
  );
  const selectedPipeline = pipelines.find(
    (pipeline) => pipeline.id === selectedPipelineId,
  );
  const listColumns = useMemo<Array<DataTableColumn<Deal>>>(
    () => [
      {
        cell: (deal) => (
          <Link
            className="font-semibold text-[var(--navy)] hover:text-[var(--primary)]"
            href={`/deals/${deal.id}`}
          >
            {deal.title}
          </Link>
        ),
        header: "Deal",
        id: "title",
      },
      {
        cell: (deal) => deal.account_name ?? "Linked account",
        header: "Account",
        id: "account",
      },
      {
        cell: (deal) => deal.stage_name ?? "Current stage",
        header: "Stage",
        id: "stage",
      },
      {
        cell: (deal) => formatCurrency(toNumber(deal.value), deal.currency),
        header: "Value",
        id: "value",
      },
      {
        cell: (deal) => <StatusPill status={deal.status} type="deal" />,
        header: "Status",
        id: "status",
      },
      {
        cell: (deal) => formatDate(deal.expected_close),
        header: "Expected Close",
        id: "expected_close",
      },
      {
        cell: (deal) => deal.owner_name ?? "Unassigned",
        header: "Owner",
        id: "owner",
      },
    ],
    [],
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={
          canWriteDeals
            ? {
                icon: Plus,
                label: "New Deal",
                onClick: () => setFormOpen(true),
              }
            : undefined
        }
        subtitle="Track active opportunities, forecast value, and stage progress."
        title="Deals"
      />

      <SavedViews
        scope="deals"
        value={filters}
        onLoad={(saved) => {
          setFilters(saved);
          setPage(1);
        }}
      />
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 sm:w-72">
            {pipelinesQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <select
                aria-label="Select pipeline"
                className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm font-medium text-[var(--navy)] shadow-sm"
                onChange={(event) => selectPipeline(event.target.value)}
                value={selectedPipelineId}
              >
                {pipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex rounded-md border border-slate-200 bg-slate-50 p-1">
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium",
                viewMode === "kanban"
                  ? "bg-white text-[var(--navy)] shadow-sm"
                  : "text-[var(--muted-foreground)]",
              )}
              onClick={() => setViewMode("kanban")}
              type="button"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              Kanban
            </button>
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium",
                viewMode === "list"
                  ? "bg-white text-[var(--navy)] shadow-sm"
                  : "text-[var(--muted-foreground)]",
              )}
              onClick={() => setViewMode("list")}
              type="button"
            >
              <List className="h-4 w-4" aria-hidden="true" />
              List
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(320px,1.4fr)] lg:items-center">
          <div>
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Forecast
            </h2>
            <label className="mt-2 block text-sm">
              Currency{" "}
              <select
                aria-label="Forecast currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="rounded border p-2"
              >
                {["USD", "ETB", "EUR", "GBP"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-xs text-slate-600">
              Only deals in the selected currency are included. No exchange-rate
              conversion.
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {selectedPipeline?.name ?? "Selected pipeline"}
            </p>
          </div>
          {forecastQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          ) : forecastQuery.isError ? (
            <p role="alert" className="text-red-700">
              Forecast unavailable.{" "}
              <button
                className="underline"
                onClick={() => forecastQuery.refetch()}
              >
                Retry
              </button>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-[var(--background)] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
                  <TrendingUp
                    className="h-4 w-4 text-[var(--primary)]"
                    aria-hidden="true"
                  />
                  Weighted Forecast
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--navy)]">
                  {formatCurrency(
                    forecastQuery.data?.total_weighted ?? 0,
                    currency,
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
                  <Target
                    className="h-4 w-4 text-[var(--navy)]"
                    aria-hidden="true"
                  />
                  Total Open
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--navy)]">
                  {formatCurrency(
                    forecastQuery.data?.total_open ?? 0,
                    currency,
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <ForecastChart pipelineId={selectedPipelineId} currency={currency} />

      {viewMode === "kanban" ? (
        kanbanQuery.isLoading ? (
          <Skeleton className="h-[680px] rounded-xl" />
        ) : kanbanQuery.isError ? (
          <div className="rounded-xl border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">
            Could not load Kanban board.
          </div>
        ) : (
          <KanbanBoard
            canDrag={canWriteDeals}
            detailsById={detailsById}
            stages={kanbanQuery.data?.stages ?? []}
          />
        )
      ) : (
        <DataTable
          columns={listColumns}
          data={dealsQuery.data ?? []}
          emptyMessage="No deals found."
          getRowKey={(deal) => deal.id}
          isLoading={dealsQuery.isLoading}
          error={dealsQuery.isError}
          onRetry={() => dealsQuery.refetch()}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} · up to {PAGE_SIZE} deals
        </span>
        <Button
          variant="outline"
          disabled={
            dealsQuery.isFetching || (dealsQuery.data?.length ?? 0) < PAGE_SIZE
          }
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
      {dealsQuery.isError && (
        <p role="alert" className="text-red-700">
          Deals could not be loaded.{" "}
          <button onClick={() => dealsQuery.refetch()}>Retry</button>
        </p>
      )}
      {canWriteDeals ? (
        <DealForm
          onOpenChange={setFormOpen}
          open={formOpen}
          selectedPipelineId={selectedPipelineId}
        />
      ) : null}
    </div>
  );
}
