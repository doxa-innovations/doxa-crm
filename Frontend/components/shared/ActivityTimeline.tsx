"use client";

import { useMemo, useState } from "react";

import { ActivityTypeIcon } from "@/components/activities/ActivityTypeIcon";
import { cn, formatDate } from "@/lib/utils";
import type {
  ActivityType,
  ContactTimelineItem,
  Deal,
  Task,
} from "@/types/api";

export type ActivityTimelineFilter =
  "all" | "calls" | "emails" | "tasks" | "deals";

export interface ActivityTimelineItem {
  id: string;
  type: ActivityType | "deal";
  subject: string;
  date: string;
  description?: string | null;
  outcome?: string | null;
}

interface ActivityTimelineProps {
  className?: string;
  items: ActivityTimelineItem[];
}

function fromContactTimelineType(
  item: ContactTimelineItem,
): ActivityType | "deal" {
  if (item.type === "deal") {
    return "deal";
  }

  if (item.type === "task") {
    return "task";
  }

  if (item.type === "note") {
    return "note";
  }

  const activityType = item.metadata.activity_type;
  return activityType === "call" ||
    activityType === "email" ||
    activityType === "meeting" ||
    activityType === "note"
    ? activityType
    : "note";
}

export function contactTimelineToActivityItems(
  items: ContactTimelineItem[],
): ActivityTimelineItem[] {
  return items.map((item) => ({
    date: item.occurred_at,
    description: item.description,
    id: item.id,
    outcome:
      typeof item.metadata.outcome === "string"
        ? item.metadata.outcome
        : typeof item.metadata.status === "string"
          ? item.metadata.status
          : null,
    subject: item.title,
    type: fromContactTimelineType(item),
  }));
}

export function taskTimelineItems(tasks: Task[]): ActivityTimelineItem[] {
  return tasks.map((task) => ({
    date: task.completed_at ?? task.due_at ?? task.created_at,
    description: task.description,
    id: task.id,
    outcome: task.status,
    subject: task.title,
    type: "task",
  }));
}

export function dealTimelineItems(deals: Deal[]): ActivityTimelineItem[] {
  return deals.map((deal) => ({
    date: deal.expected_close,
    description: deal.account_name ?? null,
    id: deal.id,
    outcome: deal.status,
    subject: deal.title,
    type: "deal",
  }));
}

function filterItem(
  item: ActivityTimelineItem,
  filter: ActivityTimelineFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "calls") {
    return item.type === "call";
  }

  if (filter === "emails") {
    return item.type === "email";
  }

  if (filter === "tasks") {
    return item.type === "task";
  }

  return item.type === "deal";
}

function typeLabel(type: ActivityType | "deal"): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function ActivityTimeline({ className, items }: ActivityTimelineProps) {
  const [filter, setFilter] = useState<ActivityTimelineFilter>("all");
  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (left, right) =>
          new Date(right.date).getTime() - new Date(left.date).getTime(),
      ),
    [items],
  );
  const filteredItems = sortedItems.filter((item) => filterItem(item, filter));
  const filters: Array<{ label: string; value: ActivityTimelineFilter }> = [
    { label: "All", value: "all" },
    { label: "Calls", value: "calls" },
    { label: "Emails", value: "emails" },
    { label: "Tasks", value: "tasks" },
    { label: "Deals", value: "deals" },
  ];

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === item.value
                ? "bg-[var(--primary)] text-white"
                : "bg-slate-100 text-[var(--muted-foreground)] hover:bg-slate-200",
            )}
            key={item.value}
            onClick={() => setFilter(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-[var(--muted-foreground)]">
            No timeline items found.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <article
                className="flex gap-4 rounded-xl border border-slate-100 bg-white p-4"
                key={`${item.type}-${item.id}`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--background)] text-[var(--primary)]">
                  <ActivityTypeIcon className="h-5 w-5" type={item.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[var(--navy)]">
                        {item.subject}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-[var(--muted-foreground)]">
                        {typeLabel(item.type)}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(item.date)}
                    </span>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-sm text-slate-700">
                      {item.description}
                    </p>
                  ) : null}
                  {item.outcome ? (
                    <p className="mt-2 text-xs font-medium text-[var(--muted-foreground)]">
                      {item.outcome}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
