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
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGlobalSearch } from "@/hooks/useSearch";
import { cn } from "@/lib/utils";
import type { GlobalSearchResponse, SearchResult } from "@/types/api";

type SearchGroupKey = keyof GlobalSearchResponse;

interface SearchGroupConfig {
  icon: LucideIcon;
  key: SearchGroupKey;
  label: string;
}

interface DisplayResult {
  group: SearchGroupConfig;
  item: SearchResult;
}

interface SearchModalProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const searchGroups: SearchGroupConfig[] = [
  { icon: Users, key: "contacts", label: "CONTACTS" },
  { icon: Kanban, key: "deals", label: "DEALS" },
  { icon: Building2, key: "accounts", label: "ACCOUNTS" },
  { icon: UserPlus, key: "leads", label: "LEADS" },
];

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}

function resultSubtitle(result: SearchResult): string {
  if (result.subtitle) {
    return result.subtitle;
  }

  if (result.type === "lead") {
    return "Lead";
  }

  if (result.type === "deal") {
    return "Deal";
  }

  if (result.type === "account") {
    return "Account";
  }

  return "Contact";
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

function hasAnyResults(data: GlobalSearchResponse | undefined): boolean {
  return searchGroups.some((group) => (data?.[group.key] ?? []).length > 0);
}

export function SearchModal({ onOpenChange, open }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 300);
  const searchQuery = useGlobalSearch(debouncedQuery);

  const groupedResults = useMemo(
    () =>
      searchGroups
        .map((group) => ({
          ...group,
          results: (searchQuery.data?.[group.key] ?? []).slice(0, 5),
          total: searchQuery.data?.[group.key]?.length ?? 0,
        }))
        .filter((group) => group.total > 0),
    [searchQuery.data],
  );

  const flatResults = useMemo<DisplayResult[]>(
    () =>
      groupedResults.flatMap((group) =>
        group.results.map((item) => ({ group, item })),
      ),
    [groupedResults],
  );

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    setQuery("");
    setHighlightedIndex(0);
  }, [open]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [debouncedQuery]);

  useEffect(() => {
    if (flatResults.length === 0) {
      setHighlightedIndex(0);
      return;
    }

    setHighlightedIndex((current) => Math.min(current, flatResults.length - 1));
  }, [flatResults.length]);

  function navigateToResult(result: DisplayResult) {
    router.push(resultUrl(result.item, result.group.key));
    onOpenChange(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (flatResults.length > 0) {
        setHighlightedIndex((current) => (current + 1) % flatResults.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (flatResults.length > 0) {
        setHighlightedIndex(
          (current) => (current - 1 + flatResults.length) % flatResults.length,
        );
      }
      return;
    }

    if (event.key === "Enter") {
      const result = flatResults[highlightedIndex];
      if (result) {
        event.preventDefault();
        navigateToResult(result);
      }
    }
  }

  const searching = query.trim().length >= 2 && searchQuery.isFetching;
  const showEmpty =
    debouncedQuery.trim().length >= 2 &&
    !searching &&
    !searchQuery.isError &&
    !hasAnyResults(searchQuery.data);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-5 py-4">
          <DialogTitle className="text-[var(--navy)]">
            Global Search
          </DialogTitle>
          <DialogDescription>
            Find contacts, accounts, deals, and leads.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-slate-200 p-4">
          <div className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]/15">
            <Search
              className="h-5 w-5 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <input
              aria-label="Search CRM"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--navy)] outline-none placeholder:text-[var(--muted-foreground)]"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search contacts, deals, accounts, leads..."
              ref={inputRef}
              value={query}
            />
            {searching ? (
              <Loader2
                className="h-4 w-4 animate-spin text-[var(--primary)]"
                aria-hidden="true"
              />
            ) : null}
            <span className="hidden rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] sm:inline-flex">
              Esc
            </span>
          </div>
          {query.trim().length > 0 && query.trim().length < 2 ? (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Type at least 2 characters to search.
            </p>
          ) : null}
        </div>

        <div className="max-h-[64vh] overflow-y-auto p-3">
          {searchQuery.isError ? (
            <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              Could not run search.
            </div>
          ) : null}

          {showEmpty ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-[var(--muted-foreground)]">
              No results for '{debouncedQuery.trim()}'
            </div>
          ) : null}

          {!searchQuery.isError && !showEmpty && groupedResults.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-[var(--muted-foreground)]">
              Search across your CRM records.
            </div>
          ) : null}

          <div className="grid gap-4">
            {groupedResults.map((group) => {
              const Icon = group.icon;

              return (
                <section key={group.key}>
                  <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {group.label} ({group.total})
                  </div>
                  <div className="grid gap-1">
                    {group.results.map((result) => {
                      const globalIndex = flatResults.findIndex(
                        (entry) =>
                          entry.group.key === group.key &&
                          entry.item.id === result.id,
                      );
                      const active = globalIndex === highlightedIndex;

                      return (
                        <button
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition",
                            active
                              ? "bg-[var(--background)] text-[var(--navy)] ring-1 ring-[var(--primary)]/20"
                              : "hover:bg-slate-50",
                          )}
                          key={`${group.key}-${result.id}`}
                          onClick={() =>
                            navigateToResult({ group, item: result })
                          }
                          onMouseEnter={() => setHighlightedIndex(globalIndex)}
                          type="button"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--background)] text-[var(--primary)]">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[var(--navy)]">
                              {result.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
                              {resultSubtitle(result)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
