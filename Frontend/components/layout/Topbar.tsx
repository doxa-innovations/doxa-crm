"use client";

import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle, Bell, BriefcaseBusiness, Loader2, Menu, RefreshCcw, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SearchModal } from "@/components/search/SearchModal";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { normalizeRole } from "@/lib/auth-types";
import { cn, formatCurrency, getInitials } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { ApiErrorPayload, Deal, Task } from "@/types/api";

interface TopbarProps {
  onMenuClick: () => void;
}

function titleFromPath(pathname: string): string {
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";

  return firstSegment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function apiErrorMessage(error: unknown): string {
  const apiError = error as Partial<ApiErrorPayload>;
  return typeof apiError.detail === "string" ? apiError.detail : "Could not load notifications.";
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

function daysOverdue(task: Task): number {
  if (!task.due_at) {
    return 0;
  }

  return Math.max(0, differenceInCalendarDays(new Date(), new Date(task.due_at)));
}

function daysQuiet(deal: Deal): number {
  return Math.max(14, differenceInCalendarDays(new Date(), new Date(deal.updated_at)));
}

function decimalToNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { accessToken, user: storedUser } = useAuthStore();
  const session = authClient.useSession();
  const sessionUser = session.data?.user;
  const pageTitle = useMemo(() => titleFromPath(pathname), [pathname]);
  const name =
    (typeof sessionUser?.full_name === "string" && sessionUser.full_name.trim()) ||
    (typeof sessionUser?.name === "string" && sessionUser.name.trim()) ||
    storedUser?.full_name ||
    "Amina Reed";
  const role = normalizeRole(sessionUser?.role ?? storedUser?.role);
  const displayRole = roleLabel(role);
  const shortcutLabel = isMac ? "⌘ K" : "Ctrl K";

  const hasAuthenticatedUser = Boolean(accessToken || sessionUser) && !session.isPending;

  const overdueTasksQuery = useQuery({
    enabled: hasAuthenticatedUser,
    queryFn: () => api.get<Task[]>("/tasks/overdue", { page_size: 10 }),
    queryKey: ["tasks", "overdue", "topbar"],
    refetchInterval: 300000,
  });
  const staleDealsQuery = useQuery({
    enabled: hasAuthenticatedUser,
    queryFn: () => api.get<Deal[]>("/deals/stale", { days: 14, page_size: 10 }),
    queryKey: ["deals", "stale", "topbar"],
    refetchInterval: 300000,
  });
  const overdueTasks = overdueTasksQuery.data ?? [];
  const staleDeals = staleDealsQuery.data ?? [];
  const notificationCount = overdueTasks.length + staleDeals.length;
  const isLoadingNotifications = overdueTasksQuery.isLoading || staleDealsQuery.isLoading;
  const isFetchingNotifications = overdueTasksQuery.isFetching || staleDealsQuery.isFetching;
  const notificationsError =
    overdueTasksQuery.isError || staleDealsQuery.isError
      ? apiErrorMessage(overdueTasksQuery.error ?? staleDealsQuery.error)
      : null;

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(window.navigator.platform));
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isSearchShortcut) {
        return;
      }

      event.preventDefault();
      setSearchOpen(true);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-100 bg-white/95 px-4 backdrop-blur md:px-6">
      <nav className="flex h-full items-center justify-between gap-4" aria-label="Primary">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Open navigation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 md:hidden"
            type="button"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <ol className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[#64748B] sm:text-sm">
            <li className="shrink-0">Doxa CRM</li>
            <li className="text-slate-300" aria-hidden="true">
              /
            </li>
            <li className="truncate text-slate-500" aria-current="page">
              {pageTitle}
            </li>
          </ol>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <button
            className="group hidden h-10 min-w-0 items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/80 px-3 text-left text-sm text-[#64748B] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors hover:border-slate-300 hover:bg-white md:inline-flex md:w-64 lg:w-80"
            onClick={() => setSearchOpen(true)}
            onFocus={() => setSearchOpen(true)}
            type="button"
          >
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Search</span>
            <kbd className="inline-flex h-6 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold leading-none text-slate-500 shadow-sm">
              {shortcutLabel}
            </kbd>
          </button>

          <button
            aria-label="Search"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 md:hidden"
            onClick={() => setSearchOpen(true)}
            type="button"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="relative" ref={notificationsRef}>
            <button
              aria-expanded={notificationsOpen}
              aria-haspopup="dialog"
              aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} active` : ""}`}
              className={cn(
                "relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950",
                notificationsOpen && "bg-slate-100 text-slate-950",
              )}
              onClick={() => setNotificationsOpen((open) => !open)}
              type="button"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {notificationCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div
                className="absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
                role="dialog"
                aria-label="Notifications"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2444]">Notifications</p>
                    <p className="mt-0.5 text-xs text-[#64748B]">
                      {notificationCount > 0
                        ? `${notificationCount} item${notificationCount === 1 ? "" : "s"} need attention`
                        : "No urgent CRM alerts"}
                    </p>
                  </div>
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950"
                    disabled={isFetchingNotifications}
                    onClick={() => {
                      void overdueTasksQuery.refetch();
                      void staleDealsQuery.refetch();
                    }}
                    title="Refresh notifications"
                    type="button"
                  >
                    <RefreshCcw className={cn("h-4 w-4", isFetchingNotifications && "animate-spin")} aria-hidden="true" />
                    <span className="sr-only">Refresh notifications</span>
                  </button>
                </div>

                <div className="max-h-[min(28rem,calc(100vh-7rem))] overflow-y-auto p-2">
                  {isLoadingNotifications ? (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm text-[#64748B]">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading notifications...
                    </div>
                  ) : notificationsError ? (
                    <div className="rounded-md border border-red-100 bg-red-50/70 px-3 py-3 text-sm text-red-700">
                      {notificationsError}
                    </div>
                  ) : notificationCount === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-[#64748B]">
                      Everything looks clear right now.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {overdueTasks.length > 0 ? (
                        <div>
                          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-normal text-red-700">
                            Overdue tasks
                          </p>
                          <div className="space-y-1">
                            {overdueTasks.map((task) => (
                              <Link
                                className="flex gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-red-50/70"
                                href="/tasks"
                                key={task.id}
                                onClick={() => setNotificationsOpen(false)}
                              >
                                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-100">
                                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-[#0F2444]">{task.title}</span>
                                  <span className="mt-0.5 block truncate text-xs text-[#64748B]">{linkedEntityLabel(task)}</span>
                                  <span className="mt-1 block text-xs font-medium text-red-700">
                                    {daysOverdue(task)}d overdue
                                  </span>
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {staleDeals.length > 0 ? (
                        <div>
                          <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-normal text-amber-700">
                            Stale deals
                          </p>
                          <div className="space-y-1">
                            {staleDeals.map((deal) => (
                              <Link
                                className="flex gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-amber-50/70"
                                href={`/deals/${deal.id}`}
                                key={deal.id}
                                onClick={() => setNotificationsOpen(false)}
                              >
                                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                                  <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-[#0F2444]">{deal.title}</span>
                                  <span className="mt-0.5 block truncate text-xs text-[#64748B]">
                                    {deal.account_name ?? "No account"} / {formatCurrency(decimalToNumber(deal.value), deal.currency)}
                                  </span>
                                  <span className="mt-1 block text-xs font-medium text-amber-700">
                                    {daysQuiet(deal)} days without activity
                                  </span>
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 border-t border-slate-100 text-sm font-semibold">
                  <Link
                    className="px-4 py-3 text-center text-[#2563EB] transition-colors hover:bg-slate-50"
                    href="/tasks"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    View tasks
                  </Link>
                  <Link
                    className="border-l border-slate-100 px-4 py-3 text-center text-[#2563EB] transition-colors hover:bg-slate-50"
                    href="/deals"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    View deals
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <button
            className="flex h-11 items-center gap-3 rounded-full px-1.5 pl-3 text-left transition-colors hover:bg-slate-100"
            title={`${name} - ${displayRole}`}
            type="button"
          >
            <span className="hidden min-w-0 text-right sm:block">
              <span className="block max-w-36 truncate text-sm font-medium leading-5 text-slate-950">{name}</span>
              <span className="block max-w-36 truncate text-xs leading-4 text-slate-500/80">{displayRole}</span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/70 bg-gradient-to-br from-blue-50 via-indigo-50 to-emerald-50 text-xs font-semibold text-[#0F2444] shadow-sm ring-1 ring-slate-200/70">
              {getInitials(name)}
            </span>
          </button>
        </div>
      </nav>
      <SearchModal onOpenChange={setSearchOpen} open={searchOpen} />
    </header>
  );
}
