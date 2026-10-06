import { cn } from "@/lib/utils";

export type StatusPillType =
  "lead" | "deal" | "task" | "health" | "campaign" | "role";

interface StatusPillProps {
  status: string;
  type: StatusPillType;
  className?: string;
}

const statusStyles: Record<StatusPillType, Record<string, string>> = {
  campaign: {
    active: "bg-blue-50 text-[var(--primary)] ring-blue-100",
    completed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    draft: "bg-slate-100 text-[var(--muted-foreground)] ring-slate-200",
    paused: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  deal: {
    lost: "bg-red-50 text-red-700 ring-red-100",
    open: "bg-blue-50 text-[var(--primary)] ring-blue-100",
    won: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  health: {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    red: "bg-red-50 text-red-700 ring-red-100",
    yellow: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  role: {
    customer_success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    marketing_manager: "bg-amber-50 text-amber-700 ring-amber-100",
    marketing_rep: "bg-amber-50 text-amber-700 ring-amber-100",
    read_only: "bg-slate-100 text-[var(--muted-foreground)] ring-slate-200",
    sales_manager: "bg-blue-50 text-[var(--primary)] ring-blue-100",
    sales_rep: "bg-blue-50 text-[var(--primary)] ring-blue-100",
    super_admin: "bg-[var(--navy)]/10 text-[var(--navy)] ring-[var(--navy)]/10",
  },
  lead: {
    contacted: "bg-blue-50 text-[var(--primary)] ring-blue-100",
    converted: "bg-[var(--navy)]/10 text-[var(--navy)] ring-[var(--navy)]/10",
    disqualified: "bg-red-50 text-red-700 ring-red-100",
    new: "bg-slate-100 text-[var(--muted-foreground)] ring-slate-200",
    qualified: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  task: {
    completed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    in_progress: "bg-blue-50 text-[var(--primary)] ring-blue-100",
    overdue: "bg-red-50 text-red-700 ring-red-100",
    pending: "bg-slate-100 text-[var(--muted-foreground)] ring-slate-200",
  },
};

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusPill({ className, status, type }: StatusPillProps) {
  const normalizedStatus = status.toLowerCase();
  const tone =
    statusStyles[type][normalizedStatus] ??
    "bg-slate-100 text-[var(--muted-foreground)] ring-slate-200";

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium leading-none ring-1 ring-inset",
        tone,
        className,
      )}
    >
      {formatStatusLabel(status)}
    </span>
  );
}
