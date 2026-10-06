"use client";

import {
  Building2,
  Kanban,
  Loader2,
  Search,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlobalSearch } from "@/hooks/useSearch";
import type { GlobalSearchResponse, SearchResult } from "@/types/api";

type SearchGroupKey = keyof GlobalSearchResponse;

interface SearchGroupConfig {
  icon: LucideIcon;
  key: SearchGroupKey;
  label: string;
}

const searchGroups: SearchGroupConfig[] = [
  { icon: Users, key: "contacts", label: "Contacts" },
  { icon: Kanban, key: "deals", label: "Deals" },
  { icon: Building2, key: "accounts", label: "Accounts" },
  { icon: UserPlus, key: "leads", label: "Leads" },
];

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}

function resultUrl(result: SearchResult, groupKey: SearchGroupKey): string {
  if (result.url) {
    return result.url;
  }

  const basePath =
    groupKey === "contacts"
      ? "/contacts"
      : groupKey === "deals"
        ? "/deals"
        : groupKey === "accounts"
          ? "/accounts"
          : "/leads";
  return `${basePath}/${result.id}`;
}

function resultSubtitle(result: SearchResult): string {
  return result.subtitle || result.type;
}

export function SearchPageClient() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const searchQuery = useGlobalSearch(debouncedQuery);
  const groupedResults = useMemo(
    () =>
      searchGroups
        .map((group) => ({
          ...group,
          results: searchQuery.data?.[group.key] ?? [],
        }))
        .filter((group) => group.results.length > 0),
    [searchQuery.data],
  );
  const showIntro = debouncedQuery.trim().length < 2;
  const showEmpty =
    !showIntro &&
    !searchQuery.isFetching &&
    !searchQuery.isError &&
    groupedResults.length === 0;

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-200 px-3 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]/15">
        <Search
          className="h-5 w-5 text-[var(--muted-foreground)]"
          aria-hidden="true"
        />
        <Input
          aria-label="Search CRM"
          autoFocus
          className="h-11 border-0 px-0 shadow-none focus-visible:ring-0"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search contacts, deals, accounts, leads..."
          value={query}
        />
        {searchQuery.isFetching ? (
          <Loader2
            className="h-4 w-4 animate-spin text-[var(--primary)]"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {showIntro ? (
        <div className="mt-5">
          <EmptyState
            description="Type at least 2 characters to search records."
            icon={Search}
            title="Search your CRM"
          />
        </div>
      ) : null}

      {searchQuery.isError ? (
        <div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          Could not run search. Please try again.
        </div>
      ) : null}

      {showEmpty ? (
        <div className="mt-5">
          <EmptyState
            description={`No results for "${debouncedQuery.trim()}".`}
            icon={Search}
            title="No matching records"
          />
        </div>
      ) : null}

      {searchQuery.isFetching && groupedResults.length === 0 ? (
        <div className="mt-5 grid gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton className="h-16 w-full rounded-lg" key={index} />
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid gap-6">
        {groupedResults.map((group) => {
          const Icon = group.icon;

          return (
            <section key={group.key}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {group.label} ({group.results.length})
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                {group.results.map((result) => (
                  <Link
                    className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-[var(--background)]"
                    href={resultUrl(result, group.key)}
                    key={`${group.key}-${result.id}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--background)] text-[var(--primary)]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--navy)]">
                        {result.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
                        {resultSubtitle(result)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
