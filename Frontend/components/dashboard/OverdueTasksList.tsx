"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { Check, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { ApiErrorPayload, Task } from "@/types/api";

const DASHBOARD_REFETCH_INTERVAL = 300000;

function getErrorMessage(error: unknown): string {
  const apiError = error as Partial<ApiErrorPayload>;
  return typeof apiError.detail === "string"
    ? apiError.detail
    : "Could not load overdue tasks.";
}

function linkedEntityLabel(task: Task): string {
  if (task.contact_id) {
    return task.contact_name ? `Contact: ${task.contact_name}` : "Contact";
  }

  if (task.deal_id) {
    return task.deal_name ? `Deal: ${task.deal_name}` : "Deal";
  }

  if (task.lead_id) {
    return task.lead_name ? `Lead: ${task.lead_name}` : "Lead";
  }

  if (task.account_id) {
    return task.account_name ? `Account: ${task.account_name}` : "Account";
  }

  return "No linked record";
}

function getDaysOverdue(task: Task): number {
  if (!task.due_at) {
    return 0;
  }

  return Math.max(
    0,
    differenceInCalendarDays(new Date(), new Date(task.due_at)),
  );
}

function OverdueTasksSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((item) => (
        <div className="rounded-lg border border-slate-200/70 p-3" key={item}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OverdueTasksList() {
  const queryClient = useQueryClient();
  const { canWriteTasks } = usePermissions();
  const tasksQuery = useQuery({
    queryFn: () => api.get<Task[]>("/tasks/overdue", { page_size: 5 }),
    queryKey: ["dashboard", "overdue-tasks"],
    refetchInterval: DASHBOARD_REFETCH_INTERVAL,
  });
  const completeTask = useMutation({
    mutationFn: (id: string) => api.post<Task>(`/tasks/${id}/complete`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({
        queryKey: ["reports", "dashboard"],
      });
      void queryClient.invalidateQueries({ queryKey: ["tasks", "overdue"] });
    },
  });

  const tasks = (tasksQuery.data ?? []).slice(0, 5);

  return (
    <section className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">
            Overdue Tasks
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            The oldest overdue work that needs attention.
          </p>
        </div>
        {tasksQuery.isError ? (
          <button
            className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
            onClick={() => void tasksQuery.refetch()}
            type="button"
          >
            <RefreshCcw
              className={cn(
                "h-3.5 w-3.5",
                tasksQuery.isFetching && "animate-spin",
              )}
              aria-hidden="true"
            />
            Retry
          </button>
        ) : null}
      </div>

      <div className="p-5">
        {tasksQuery.isLoading ? (
          <OverdueTasksSkeleton />
        ) : tasksQuery.isError ? (
          <div className="rounded-lg border border-red-100 bg-red-50/50 p-4 text-sm text-red-700">
            {getErrorMessage(tasksQuery.error)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center text-sm text-[var(--muted-foreground)]">
            No overdue tasks - you're on top of it.
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const daysOverdue = getDaysOverdue(task);
              const ownerName =
                task.owner_name ?? task.assigned_to_name ?? "Unassigned";

              return (
                <div
                  className="grid gap-3 rounded-lg border border-slate-200/70 bg-white px-3 py-3 transition-colors hover:border-slate-300/80 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  key={task.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[var(--navy)]">
                        {task.title}
                      </p>
                      <span className="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                        {daysOverdue}d overdue
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      <span>{linkedEntityLabel(task)}</span>
                      <span className="text-slate-300">/</span>
                      <span>Owner: {ownerName}</span>
                    </p>
                  </div>
                  {canWriteTasks ? (
                    <Button
                      disabled={
                        completeTask.isPending &&
                        completeTask.variables === task.id
                      }
                      onClick={() => completeTask.mutate(task.id)}
                      size="sm"
                      variant="outline"
                      type="button"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Complete
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
