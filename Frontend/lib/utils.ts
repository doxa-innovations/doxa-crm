import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNow } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

export function formatDate(date: Date | string | number): string {
  return format(new Date(date), "MMM d, yyyy");
}

export function formatRelative(date: Date | string | number): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "U";
}

/** Format an instant for datetime-local without discarding its timezone offset. */
export function toLocalDateTime(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatReportCurrency(value: number): string {
  let currency = "USD";
  try {
    if (typeof window !== "undefined")
      currency = localStorage.getItem("doxa:report-currency") || "USD";
  } catch {}
  return formatCurrency(value, currency);
}
