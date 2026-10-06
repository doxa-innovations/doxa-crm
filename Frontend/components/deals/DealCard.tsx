"use client";

import { isBefore, startOfToday } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { cn, formatCurrency, formatDate, getInitials } from "@/lib/utils";
import type { Deal, DealSummary } from "@/types/api";

interface DealCardProps {
  deal: DealSummary;
  detail?: Deal;
  isDragging?: boolean;
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function DealCard({ deal, detail, isDragging = false }: DealCardProps) {
  const router = useRouter();
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const isOverdue =
    deal.status === "open" &&
    isBefore(new Date(deal.expected_close), startOfToday());
  const ownerName = detail?.owner_name ?? "Owner";
  const accountName =
    detail?.account_name ?? `Account ${deal.account_id.slice(0, 8)}`;
  const contactName =
    detail?.contact_name ?? `Contact ${deal.contact_id.slice(0, 8)}`;
  const openDealDetail = () => router.push(`/deals/${deal.id}`);

  function handleClick() {
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }

    openDealDetail();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDealDetail();
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    pointerMovedRef.current = false;
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;

    if (!start) {
      return;
    }

    if (
      Math.abs(event.clientX - start.x) > 5 ||
      Math.abs(event.clientY - start.y) > 5
    ) {
      pointerMovedRef.current = true;
    }
  }

  return (
    <div
      aria-label={`Open ${deal.title}`}
      className={cn(
        "w-full cursor-grab rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] active:cursor-grabbing",
        isDragging && "rotate-1 border-blue-300 shadow-lg",
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-sm font-bold text-[var(--navy)]">
          {deal.title}
        </h3>
        {isOverdue ? (
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-red-600"
            aria-label="Expected close is overdue"
          />
        ) : null}
      </div>
      <p className="mt-2 truncate text-xs text-[var(--muted-foreground)]">
        {accountName} - {contactName}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--navy)]">
          {formatCurrency(toNumber(deal.value), deal.currency)}
        </p>
        <span className="rounded-full bg-[var(--background)] px-2 py-1 text-xs font-semibold text-[var(--primary)]">
          {Math.round(deal.probability)}%
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p
          className={cn(
            "text-xs font-medium",
            isOverdue ? "text-red-600" : "text-[var(--muted-foreground)]",
          )}
        >
          {formatDate(deal.expected_close)}
        </p>
        <div
          className="grid h-7 w-7 place-items-center rounded-full bg-[var(--navy)] text-xs font-semibold text-white"
          title={ownerName}
        >
          {getInitials(ownerName)}
        </div>
      </div>
    </div>
  );
}
