"use client";
import { SavedViews } from "@/components/shared/SavedViews";
import { useListState } from "@/hooks/useListState";
import {
  useRecordOptions,
  RecordOptionsStatus,
} from "@/hooks/useRecordOptions";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Edit, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActivityForm } from "@/components/activities/ActivityForm";
import { ActivityTypeIcon } from "@/components/activities/ActivityTypeIcon";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import type {
  Account,
  Activity,
  ActivityType,
  Contact,
  Deal,
  Lead,
  User,
} from "@/types/api";

const PAGE_SIZE = 20;
const selectClassName =
  "h-10 rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950";
const dateInputClassName =
  "[color-scheme:light] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100";

interface ActivityFilters {
  account_id: string;
  contact_id: string;
  date_from: string;
  date_to: string;
  deal_id: string;
  lead_id: string;
  linked_type: "lead" | "contact" | "deal" | "account" | "";
  owner_id: string;
  type: string;
}

const activityTypes: Array<Exclude<ActivityType, "task">> = [
  "call",
  "email",
  "meeting",
  "note",
];

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateFrom(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function dateTo(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59`).toISOString() : undefined;
}

function toQueryParams(page: number, filters: ActivityFilters) {
  return {
    account_id:
      filters.linked_type === "account"
        ? filters.account_id || undefined
        : undefined,
    contact_id:
      filters.linked_type === "contact"
        ? filters.contact_id || undefined
        : undefined,
    date_from: dateFrom(filters.date_from),
    date_to: dateTo(filters.date_to),
    deal_id:
      filters.linked_type === "deal" ? filters.deal_id || undefined : undefined,
    lead_id:
      filters.linked_type === "lead" ? filters.lead_id || undefined : undefined,
    owner_id: filters.owner_id || undefined,
    page,
    page_size: PAGE_SIZE,
    type: filters.type || undefined,
  };
}

function contactName(contact: Contact): string {
  return `${contact.first_name} ${contact.last_name}`;
}

function downloadCsv(csv: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "activities.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ActivitiesPageClient() {
  const queryClient = useQueryClient();
  const { canWriteActivities } = usePermissions();
  const [formOpen, setFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<Activity | null>(
    null,
  );
  const { filters, setFilters, page, setPage } = useListState<ActivityFilters>({
    account_id: "",
    contact_id: "",
    date_from: "",
    date_to: "",
    deal_id: "",
    lead_id: "",
    linked_type: "",
    owner_id: "",
    type: "",
  });
  const [exporting, setExporting] = useState(false);

  const activitiesQuery = useQuery({
    queryFn: () =>
      api.get<Activity[]>("/activities/", toQueryParams(page, filters)),
    queryKey: ["activities", "list", page, filters],
  });
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/directory"),
    queryKey: ["users", "activity-filter"],
    retry: false,
  });
  const leadsQuery = useRecordOptions<Lead>("/leads/", {}, [
    "leads",
    "activities-filters",
  ]);
  const contactsQuery = useRecordOptions<Contact>("/contacts/", {}, [
    "contacts",
    "activities-filters",
  ]);
  const dealsQuery = useRecordOptions<Deal>("/deals/", {}, [
    "deals",
    "activities-filters",
  ]);
  const accountsQuery = useRecordOptions<Account>("/accounts/", {}, [
    "accounts",
    "activities-filters",
  ]);
  const deleteActivity = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/activities/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({
        queryKey: ["contacts", "timeline"],
      });
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["leads", "activities"] });
      setDeletingActivity(null);
    },
  });

  const userMap = useMemo(
    () =>
      new Map((usersQuery.data ?? []).map((user) => [user.id, user.full_name])),
    [usersQuery.data],
  );
  const leadMap = useMemo(
    () =>
      new Map((leadsQuery.data ?? []).map((lead) => [lead.id, lead.full_name])),
    [leadsQuery.data],
  );
  const contactMap = useMemo(
    () =>
      new Map(
        (contactsQuery.data ?? []).map((contact) => [
          contact.id,
          contactName(contact),
        ]),
      ),
    [contactsQuery.data],
  );
  const dealMap = useMemo(
    () => new Map((dealsQuery.data ?? []).map((deal) => [deal.id, deal.title])),
    [dealsQuery.data],
  );
  const accountMap = useMemo(
    () =>
      new Map(
        (accountsQuery.data ?? []).map((account) => [account.id, account.name]),
      ),
    [accountsQuery.data],
  );

  const activities = activitiesQuery.data ?? [];
  const columns = useMemo<Array<DataTableColumn<Activity>>>(
    () => [
      {
        cell: (activity) => (
          <ActivityTypeIcon
            className="h-5 w-5 text-[var(--primary)]"
            type={activity.type}
          />
        ),
        header: "Type",
        id: "type",
      },
      { accessor: "subject", header: "Subject", id: "subject" },
      {
        cell: (activity) => {
          if (activity.contact_id) {
            return (
              <Link
                className="text-[var(--primary)] hover:underline"
                href={`/contacts/${activity.contact_id}`}
              >
                {contactMap.get(activity.contact_id) ?? "Contact"}
              </Link>
            );
          }
          if (activity.deal_id) {
            return (
              <Link
                className="text-[var(--primary)] hover:underline"
                href={`/deals/${activity.deal_id}`}
              >
                {dealMap.get(activity.deal_id) ?? "Deal"}
              </Link>
            );
          }
          if (activity.lead_id) {
            return (
              <Link
                className="text-[var(--primary)] hover:underline"
                href={`/leads/${activity.lead_id}`}
              >
                {leadMap.get(activity.lead_id) ?? "Lead"}
              </Link>
            );
          }
          if (activity.account_id) {
            return (
              <Link
                className="text-[var(--primary)] hover:underline"
                href={`/accounts/${activity.account_id}`}
              >
                {accountMap.get(activity.account_id) ?? "Account"}
              </Link>
            );
          }
          return (
            <span className="text-[var(--muted-foreground)]">No link</span>
          );
        },
        header: "Linked To",
        id: "linked",
      },
      {
        cell: (activity) =>
          activity.owner_name ?? userMap.get(activity.owner_id) ?? "Unassigned",
        header: "Owner",
        id: "owner",
      },
      {
        cell: (activity) =>
          activity.scheduled_at ? formatDate(activity.scheduled_at) : "None",
        header: "Scheduled At",
        id: "scheduled",
      },
      {
        cell: (activity) => activity.outcome ?? "None",
        header: "Outcome",
        id: "outcome",
      },
      {
        cell: (activity) => formatDate(activity.created_at),
        header: "Created",
        id: "created",
      },
      {
        cell: (activity) =>
          canWriteActivities ? (
            <div className="flex items-center gap-1.5">
              <Button
                onClick={() => setEditingActivity(activity)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Edit className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Edit activity</span>
              </Button>
              <Button
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setDeletingActivity(activity)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Delete activity</span>
              </Button>
            </div>
          ) : null,
        header: "",
        id: "actions",
      },
    ],
    [accountMap, canWriteActivities, contactMap, dealMap, leadMap, userMap],
  );

  function updateFilter(key: keyof ActivityFilters, value: string) {
    setPage(1);
    setFilters((current) => {
      if (key === "linked_type") {
        return {
          ...current,
          account_id: "",
          contact_id: "",
          deal_id: "",
          lead_id: "",
          linked_type: value as ActivityFilters["linked_type"],
        };
      }

      return { ...current, [key]: value };
    });
  }

  async function exportActivityCsv() {
    setExporting(true);
    try {
      const csv = await api.get<string>(
        "/activities/export/csv",
        toQueryParams(page, filters),
      );
      downloadCsv(csv);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={
          canWriteActivities
            ? {
                icon: Plus,
                label: "Log Activity",
                onClick: () => setFormOpen(true),
              }
            : undefined
        }
        subtitle="Review calls, emails, meetings, and notes across linked CRM records."
        title="Activities"
      />

      <SavedViews
        scope="activities"
        value={filters}
        onLoad={(saved) => {
          setFilters(saved);
          setPage(1);
        }}
      />
      <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <select
            aria-label="Activity type"
            className={selectClassName}
            onChange={(event) => updateFilter("type", event.target.value)}
            value={filters.type}
          >
            <option value="">All types</option>
            {activityTypes.map((type) => (
              <option key={type} value={type}>
                {optionLabel(type)}
              </option>
            ))}
          </select>
          <select
            aria-label="Owner"
            className={selectClassName}
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
          <Input
            aria-label="From date"
            className={dateInputClassName}
            onChange={(event) => updateFilter("date_from", event.target.value)}
            type="date"
            value={filters.date_from}
          />
          <Input
            aria-label="To date"
            className={dateInputClassName}
            onChange={(event) => updateFilter("date_to", event.target.value)}
            type="date"
            value={filters.date_to}
          />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
          <select
            aria-label="Linked record type"
            className={selectClassName}
            onChange={(event) =>
              updateFilter("linked_type", event.target.value)
            }
            value={filters.linked_type}
          >
            <option value="">Any linked entity</option>
            <option value="lead">Lead</option>
            <option value="contact">Contact</option>
            <option value="deal">Deal</option>
            <option value="account">Account</option>
          </select>
          {filters.linked_type === "lead" ? (
            <select
              aria-label="Lead"
              className={selectClassName}
              onChange={(event) => updateFilter("lead_id", event.target.value)}
              value={filters.lead_id}
            >
              <option value="">All leads</option>
              {(leadsQuery.data ?? []).map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.full_name}
                </option>
              ))}
            </select>
          ) : null}
          {filters.linked_type === "contact" ? (
            <select
              aria-label="Contact"
              className={selectClassName}
              onChange={(event) =>
                updateFilter("contact_id", event.target.value)
              }
              value={filters.contact_id}
            >
              <option value="">All contacts</option>
              {(contactsQuery.data ?? []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contactName(contact)}
                </option>
              ))}
            </select>
          ) : null}
          {filters.linked_type === "deal" ? (
            <select
              aria-label="Deal"
              className={selectClassName}
              onChange={(event) => updateFilter("deal_id", event.target.value)}
              value={filters.deal_id}
            >
              <option value="">All deals</option>
              {(dealsQuery.data ?? []).map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.title}
                </option>
              ))}
            </select>
          ) : null}
          {filters.linked_type === "account" ? (
            <select
              aria-label="Account"
              className={selectClassName}
              onChange={(event) =>
                updateFilter("account_id", event.target.value)
              }
              value={filters.account_id}
            >
              <option value="">All accounts</option>
              {(accountsQuery.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          disabled={exporting}
          onClick={() => void exportActivityCsv()}
          type="button"
          variant="outline"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <RecordOptionsStatus query={leadsQuery} label="leads" />
        <RecordOptionsStatus query={contactsQuery} label="contacts" />
        <RecordOptionsStatus query={dealsQuery} label="deals" />
        <RecordOptionsStatus query={accountsQuery} label="accounts" />
      </div>
      <DataTable
        columns={columns}
        data={activities}
        emptyMessage="No activities found."
        getRowKey={(activity) => activity.id}
        isLoading={activitiesQuery.isLoading}
        error={activitiesQuery.isError}
        onRetry={() => activitiesQuery.refetch()}
        pagination={{
          hasNextPage: activities.length === PAGE_SIZE,
          page,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
        }}
      />

      {activitiesQuery.isError ? (
        <div className="rounded-xl border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">
          Could not load activities.
        </div>
      ) : null}
      {canWriteActivities ? (
        <>
          <ActivityForm onOpenChange={setFormOpen} open={formOpen} />
          <ActivityForm
            activity={editingActivity}
            onOpenChange={(open) => {
              if (!open) {
                setEditingActivity(null);
              }
            }}
            open={Boolean(editingActivity)}
          />
          <ConfirmDialog
            confirmLabel="Delete"
            description="Delete this activity log. This cannot be undone."
            isPending={deleteActivity.isPending}
            onConfirm={() => {
              if (deletingActivity) {
                deleteActivity.mutate(deletingActivity.id);
              }
            }}
            onOpenChange={(open) => {
              if (!open) {
                setDeletingActivity(null);
              }
            }}
            open={Boolean(deletingActivity)}
            title="Delete activity"
          />
        </>
      ) : null}
    </div>
  );
}
