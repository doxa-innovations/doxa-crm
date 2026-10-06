"use client";
import { SavedViews } from "@/components/shared/SavedViews";
import { useListState } from "@/hooks/useListState";

import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AccountForm } from "@/components/accounts/AccountForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type { Account, AccountTier, User } from "@/types/api";

const PAGE_SIZE = 20;

interface AccountFilters {
  owner_id: string;
  search: string;
  tier: string;
}

function formatTier(tier: string): string {
  return tier
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function TierPill({ tier }: { tier: string }) {
  const tone =
    tier === "enterprise"
      ? "bg-[var(--navy)]/10 text-[var(--navy)] ring-[var(--navy)]/10"
      : tier === "startup"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
        : "bg-blue-50 text-[var(--primary)] ring-blue-100";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        tone,
      )}
    >
      {formatTier(tier)}
    </span>
  );
}

function toQueryParams(page: number, filters: AccountFilters) {
  return {
    owner_id: filters.owner_id || undefined,
    page,
    page_size: PAGE_SIZE,
    search: filters.search || undefined,
    tier: filters.tier || undefined,
  };
}

export function AccountsPageClient() {
  const { canWriteAccounts } = usePermissions();
  const { filters, setFilters, page, setPage } = useListState<AccountFilters>({
    owner_id: "",
    search: "",
    tier: "",
  });
  const [formOpen, setFormOpen] = useState(false);

  const accountsQuery = useQuery({
    queryFn: () =>
      api.get<Account[]>("/accounts/", toQueryParams(page, filters)),
    queryKey: ["accounts", "list", page, filters],
  });
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/directory"),
    queryKey: ["users", "filter-options"],
    retry: false,
  });

  const accounts = accountsQuery.data ?? [];
  const columns = useMemo<Array<DataTableColumn<Account>>>(
    () => [
      {
        cell: (account) => (
          <Link
            className="font-semibold text-[var(--navy)] hover:text-[var(--primary)]"
            href={`/accounts/${account.id}`}
          >
            {account.name}
          </Link>
        ),
        header: "Name",
        id: "name",
      },
      { accessor: "industry", header: "Industry", id: "industry" },
      { accessor: "size", header: "Size", id: "size" },
      {
        cell: (account) => <TierPill tier={account.tier} />,
        header: "Tier",
        id: "tier",
      },
      {
        cell: (account) =>
          account.linked_contact_count ?? account.contact_count ?? 0,
        header: "Contact Count",
        id: "contact_count",
      },
      {
        cell: (account) =>
          Object.entries(
            account.deal_values_by_currency ?? {
              USD: account.total_deal_value ?? 0,
            },
          )
            .map(([currency, value]) => formatCurrency(Number(value), currency))
            .join(" · ") || "No deals",
        header: "Deal Value",
        id: "deal_value",
      },
      {
        cell: (account) => account.owner_name ?? "Unassigned",
        header: "Owner",
        id: "owner",
      },
    ],
    [],
  );

  function updateFilter(key: keyof AccountFilters, value: string) {
    setPage(1);
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={
          canWriteAccounts
            ? {
                icon: Plus,
                label: "New Account",
                onClick: () => setFormOpen(true),
              }
            : undefined
        }
        subtitle="Review customer companies, ownership, contacts, and pipeline value."
        title="Accounts"
      />

      <SavedViews
        scope="accounts"
        value={filters}
        onLoad={(saved) => {
          setFilters(saved);
          setPage(1);
        }}
      />
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1.4fr)_minmax(160px,1fr)_minmax(160px,1fr)]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search accounts"
              value={filters.search}
            />
          </div>
          <select
            className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
            onChange={(event) => updateFilter("tier", event.target.value)}
            value={filters.tier}
          >
            <option value="">All tiers</option>
            {(["enterprise", "smb", "startup"] satisfies AccountTier[]).map(
              (tier) => (
                <option key={tier} value={tier}>
                  {formatTier(tier)}
                </option>
              ),
            )}
          </select>
          <select
            className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
            onChange={(event) => updateFilter("owner_id", event.target.value)}
            value={filters.owner_id}
          >
            <option value="">All owners</option>
            {(usersQuery.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {accounts.length === 0 &&
      !accountsQuery.isLoading &&
      !accountsQuery.isError ? (
        <EmptyState
          action={
            canWriteAccounts
              ? { label: "New Account", onClick: () => setFormOpen(true) }
              : undefined
          }
          description="Create the first company account or adjust your filters."
          icon={Building2}
          title="No accounts found"
        />
      ) : (
        <DataTable
          columns={columns}
          data={accounts}
          emptyMessage="No accounts found."
          getRowKey={(account) => account.id}
          isLoading={accountsQuery.isLoading}
          error={accountsQuery.isError}
          onRetry={() => accountsQuery.refetch()}
          pagination={{
            hasNextPage: accounts.length === PAGE_SIZE,
            page,
            pageSize: PAGE_SIZE,
            onPageChange: setPage,
          }}
        />
      )}

      {accountsQuery.isError ? (
        <div className="rounded-xl border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">
          Could not load accounts.
        </div>
      ) : null}

      {canWriteAccounts ? (
        <AccountForm onOpenChange={setFormOpen} open={formOpen} />
      ) : null}
    </div>
  );
}
