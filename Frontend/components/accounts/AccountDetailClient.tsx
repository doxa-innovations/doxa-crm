"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  BadgeDollarSign,
  Building2,
  Edit,
  ExternalLink,
  Mail,
  Phone,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActivityForm } from "@/components/activities/ActivityForm";
import { AccountForm } from "@/components/accounts/AccountForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type {
  Account,
  AccountDeal,
  Activity as ActivityRecord,
  Contact,
} from "@/types/api";

type AccountTab = "contacts" | "deals" | "activity";
const hiddenCustomFieldKeys = new Set(["converted_from_lead_id"]);

interface AccountDetailClientProps {
  accountId: string;
}

function formatTier(tier: string): string {
  return tier
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLabel(value: string): string {
  return value
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

function addressLines(account: Account): string[] {
  return ["street", "city", "country"]
    .map((key) => account.address[key])
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
}

function customFieldEntries(
  account: Account,
): Array<[string, string | number | boolean]> {
  return Object.entries(account.custom_fields ?? {}).filter(
    ([key]) => !hiddenCustomFieldKeys.has(key),
  );
}

export function AccountDetailClient({ accountId }: AccountDetailClientProps) {
  const queryClient = useQueryClient();
  const { canWriteAccounts, canWriteActivities } = usePermissions();
  const [tab, setTab] = useState<AccountTab>("contacts");
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const accountQuery = useQuery({
    queryFn: () => api.get<Account>(`/accounts/${accountId}`),
    queryKey: ["accounts", "detail", accountId],
  });
  const contactsQuery = useQuery({
    queryFn: () =>
      api.get<Contact[]>(`/accounts/${accountId}/contacts`, { page_size: 20 }),
    queryKey: ["accounts", "contacts", accountId],
  });
  const dealsQuery = useQuery({
    queryFn: () =>
      api.get<AccountDeal[]>(`/accounts/${accountId}/deals`, { page_size: 20 }),
    queryKey: ["accounts", "deals", accountId],
  });
  const activitiesQuery = useQuery({
    queryFn: () =>
      api.get<ActivityRecord[]>("/activities/", {
        account_id: accountId,
        page_size: 20,
      }),
    queryKey: ["accounts", "activities", accountId],
  });
  const archiveMutation = useMutation({
    mutationFn: () => api.delete<void>(`/accounts/${accountId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      window.location.href = "/accounts";
    },
  });

  const account = accountQuery.data;
  const activityInitialLink = useMemo(
    () =>
      account
        ? {
            id: account.id,
            label: account.name,
            type: "account" as const,
          }
        : undefined,
    [account?.id, account?.name],
  );
  const contactColumns = useMemo<Array<DataTableColumn<Contact>>>(
    () => [
      {
        cell: (contact) => (
          <Link
            className="font-semibold text-[var(--navy)] hover:text-[var(--primary)]"
            href={`/contacts/${contact.id}`}
          >
            {contact.first_name} {contact.last_name}
          </Link>
        ),
        header: "Name",
        id: "name",
      },
      { accessor: "email", header: "Email", id: "email" },
      { accessor: "title", header: "Title", id: "title" },
      {
        cell: (contact) => contact.owner_name ?? "Unassigned",
        header: "Owner",
        id: "owner",
      },
    ],
    [],
  );
  const dealColumns = useMemo<Array<DataTableColumn<AccountDeal>>>(
    () => [
      {
        cell: (deal) => (
          <Link
            className="font-semibold text-[var(--navy)] hover:text-[var(--primary)]"
            href={`/deals/${deal.id}`}
          >
            {deal.title}
          </Link>
        ),
        header: "Title",
        id: "title",
      },
      {
        cell: (deal) => deal.stage_name ?? "Unknown",
        header: "Stage",
        id: "stage",
      },
      {
        cell: (deal) => formatCurrency(Number(deal.value), deal.currency),
        header: "Value",
        id: "value",
      },
      {
        cell: (deal) => <StatusPill status={deal.status} type="deal" />,
        header: "Status",
        id: "status",
      },
    ],
    [],
  );

  if (accountQuery.isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (accountQuery.isError || !account) {
    return (
      <div className="rounded-xl border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">
        Could not load account.
      </div>
    );
  }

  const tabs: Array<{ label: string; value: AccountTab }> = [
    { label: "Contacts", value: "contacts" },
    { label: "Deals", value: "deals" },
    { label: "Activity", value: "activity" },
  ];

  return (
    <div className="grid gap-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg border border-blue-100 bg-[var(--background)] text-[var(--primary)]">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-normal text-[var(--navy)]">
                  {account.name}
                </h1>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Owner: {account.owner_name ?? "Unassigned"}
                </p>
              </div>
              <TierPill tier={account.tier} />
            </div>
            <a
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline"
              href={account.website}
              rel="noreferrer"
              target="_blank"
            >
              {account.website}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWriteActivities ? (
              <Button onClick={() => setActivityOpen(true)} type="button">
                <Activity className="h-4 w-4" aria-hidden="true" />
                Log Activity
              </Button>
            ) : null}
            {canWriteAccounts ? (
              <>
                <Button
                  onClick={() => setEditOpen(true)}
                  type="button"
                  variant="outline"
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  onClick={() => setConfirmArchive(true)}
                  type="button"
                  variant="ghost"
                >
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Archive
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-3">
            {tabs.map((item) => (
              <button
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === item.value
                    ? "bg-[var(--navy)] text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:bg-slate-100 hover:text-[var(--navy)]",
                )}
                key={item.value}
                onClick={() => setTab(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            {tab === "contacts" ? (
              <DataTable
                columns={contactColumns}
                data={contactsQuery.data ?? []}
                emptyMessage="No linked contacts."
                getRowKey={(contact) => contact.id}
                isLoading={contactsQuery.isLoading}
                error={contactsQuery.isError}
                onRetry={() => contactsQuery.refetch()}
              />
            ) : null}

            {tab === "deals" ? (
              <DataTable
                columns={dealColumns}
                data={dealsQuery.data ?? []}
                emptyMessage="No linked deals."
                getRowKey={(deal) => deal.id}
                isLoading={dealsQuery.isLoading}
                error={dealsQuery.isError}
                onRetry={() => dealsQuery.refetch()}
              />
            ) : null}

            {tab === "activity" ? (
              <div className="space-y-3">
                {activitiesQuery.isLoading
                  ? [1, 2, 3].map((item) => (
                      <Skeleton className="h-20 rounded-lg" key={item} />
                    ))
                  : null}
                {!activitiesQuery.isLoading &&
                (activitiesQuery.data ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-[var(--muted-foreground)]">
                    No account activity yet.
                  </div>
                ) : null}
                {!activitiesQuery.isLoading
                  ? (activitiesQuery.data ?? []).map((activity) => (
                      <article
                        className="flex gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
                        key={activity.id}
                      >
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-blue-100 bg-[var(--background)] text-[var(--primary)]">
                          {activity.type === "email" ? (
                            <Mail className="h-5 w-5" aria-hidden="true" />
                          ) : null}
                          {activity.type === "call" ? (
                            <Phone className="h-5 w-5" aria-hidden="true" />
                          ) : null}
                          {activity.type !== "email" &&
                          activity.type !== "call" ? (
                            <Activity className="h-5 w-5" aria-hidden="true" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-[var(--navy)]">
                              {activity.subject}
                            </h3>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
                              {formatLabel(activity.type)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            {formatDate(
                              activity.completed_at ??
                                activity.scheduled_at ??
                                activity.created_at,
                            )}
                          </p>
                          {activity.outcome ? (
                            <p className="mt-2 text-sm text-slate-700">
                              {activity.outcome}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    ))
                  : null}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="grid gap-4 content-start">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Account Info
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[var(--muted-foreground)]">Industry</dt>
                <dd className="mt-1 font-medium text-[var(--navy)]">
                  {account.industry}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Size</dt>
                <dd className="mt-1 font-medium text-[var(--navy)]">
                  {account.size}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Address</dt>
                <dd className="mt-1 font-medium text-[var(--navy)]">
                  {addressLines(account).join(", ") || "Not set"}
                </dd>
              </div>
              {customFieldEntries(account).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[var(--muted-foreground)]">
                    {formatLabel(key)}
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--navy)]">
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Account Totals
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  Contacts
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--navy)]">
                  {account.linked_contact_count}
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-[var(--background)] p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
                  <BadgeDollarSign
                    className="h-3.5 w-3.5 text-[var(--primary)]"
                    aria-hidden="true"
                  />
                  Deal Value
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--navy)]">
                  {Object.entries(
                    account.deal_values_by_currency ?? {
                      USD: account.total_deal_value ?? 0,
                    },
                  )
                    .map(([currency, value]) =>
                      formatCurrency(Number(value), currency),
                    )
                    .join(" · ") || "No deals"}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {canWriteAccounts ? (
        <AccountForm
          account={account}
          onOpenChange={setEditOpen}
          onSaved={() => void accountQuery.refetch()}
          open={editOpen}
        />
      ) : null}
      {canWriteActivities ? (
        <ActivityForm
          initialLink={activityInitialLink}
          onOpenChange={setActivityOpen}
          onSaved={() => void activitiesQuery.refetch()}
          open={activityOpen}
        />
      ) : null}
      {canWriteAccounts ? (
        <ConfirmDialog
          confirmLabel="Archive"
          description="Archive this account only after moving any contacts and deals to the account you want to keep."
          isPending={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutate()}
          onOpenChange={setConfirmArchive}
          open={confirmArchive}
          title="Archive account"
        />
      ) : null}
    </div>
  );
}
