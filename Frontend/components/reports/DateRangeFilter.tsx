"use client";

import { useQuery } from "@tanstack/react-query";
import { Filter } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { User } from "@/types/api";

export interface DateRangeFilterValue {
  date_from: string;
  date_to: string;
  owner_id: string;
}

interface DateRangeFilterProps {
  ownerLabel?: string;
  showOwner?: boolean;
  value: DateRangeFilterValue;
  onApply: (value: DateRangeFilterValue) => void;
}

const dateInputClassName =
  "[color-scheme:light] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100";
const labelClassName = "text-xs font-medium text-[var(--muted-foreground)]";
const selectClassName =
  "h-10 rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950 shadow-sm";

export function defaultDateRange(): DateRangeFilterValue {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 30);

  return {
    date_from: dateFrom.toISOString().slice(0, 10),
    date_to: dateTo.toISOString().slice(0, 10),
    owner_id: "",
  };
}

export function DateRangeFilter({
  onApply,
  ownerLabel = "Owner",
  showOwner = true,
  value,
}: DateRangeFilterProps) {
  const [draft, setDraft] = useState<DateRangeFilterValue>(value);
  const usersQuery = useQuery({
    enabled: showOwner,
    queryFn: () => api.get<User[]>("/users/directory"),
    queryKey: ["users", "report-filter"],
    retry: false,
  });

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
      <label className="grid gap-1.5">
        <span className={labelClassName}>From</span>
        <Input
          aria-label="Date from"
          className={dateInputClassName}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              date_from: event.target.value,
            }))
          }
          type="date"
          value={draft.date_from}
        />
      </label>
      <label className="grid gap-1.5">
        <span className={labelClassName}>To</span>
        <Input
          aria-label="Date to"
          className={dateInputClassName}
          onChange={(event) =>
            setDraft((current) => ({ ...current, date_to: event.target.value }))
          }
          type="date"
          value={draft.date_to}
        />
      </label>
      {showOwner ? (
        <label className="grid gap-1.5">
          <span className={labelClassName}>{ownerLabel}</span>
          <select
            aria-label={ownerLabel}
            className={selectClassName}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                owner_id: event.target.value,
              }))
            }
            value={draft.owner_id}
          >
            <option value="">All {ownerLabel.toLowerCase()}s</option>
            {(usersQuery.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="hidden md:block" />
      )}
      <Button onClick={() => onApply(draft)} type="button" variant="outline">
        <Filter className="h-4 w-4" aria-hidden="true" />
        Apply
      </Button>
    </div>
  );
}
