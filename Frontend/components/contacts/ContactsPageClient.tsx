"use client";
import { SavedViews } from "@/components/shared/SavedViews";
import { useListState } from "@/hooks/useListState";
import {
  useRecordOptions,
  RecordOptionsStatus,
} from "@/hooks/useRecordOptions";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ContactForm } from "@/components/contacts/ContactForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type { Account, Contact, User } from "@/types/api";

const PAGE_SIZE = 20;

interface ContactFilters {
  account_id: string;
  owner_id: string;
  search: string;
  tag: string;
}

function renderTags(tags: string[]) {
  const visibleTags = tags.slice(0, 3);
  const hiddenCount = Math.max(0, tags.length - visibleTags.length);

  if (tags.length === 0) {
    return <span className="text-[var(--muted-foreground)]">No tags</span>;
  }

  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {visibleTags.map((tag) => (
        <span
          className="rounded-full bg-[var(--background)] px-2 py-1 text-xs font-medium text-[var(--primary)]"
          key={tag}
        >
          {tag}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-[var(--muted-foreground)]">
          +{hiddenCount} more
        </span>
      ) : null}
    </div>
  );
}

function toQueryParams(page: number, filters: ContactFilters) {
  return {
    account_id: filters.account_id || undefined,
    owner_id: filters.owner_id || undefined,
    page,
    page_size: PAGE_SIZE,
    search: filters.search || undefined,
    tag: filters.tag || undefined,
  };
}

export function ContactsPageClient() {
  const queryClient = useQueryClient();
  const { canWriteContacts } = usePermissions();
  const { filters, setFilters, page, setPage } = useListState<ContactFilters>({
    account_id: "",
    owner_id: "",
    search: "",
    tag: "",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [archiveContact, setArchiveContact] = useState<Contact | null>(null);

  const contactsQuery = useQuery({
    queryFn: () =>
      api.get<Contact[]>("/contacts/", toQueryParams(page, filters)),
    queryKey: ["contacts", "list", page, filters],
  });
  const accountsQuery = useRecordOptions<Account>("/accounts/", {}, [
    "accounts",
    "contacts-filters",
  ]);
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/directory"),
    queryKey: ["users", "filter-options"],
    retry: false,
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/contacts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setArchiveContact(null);
    },
  });

  const contacts = contactsQuery.data ?? [];
  const columns = useMemo<Array<DataTableColumn<Contact>>>(
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
      {
        cell: (contact) =>
          contact.account_id ? (
            <Link
              className="text-[var(--primary)] hover:underline"
              href={`/accounts/${contact.account_id}`}
            >
              {contact.account_name ?? "Linked account"}
            </Link>
          ) : (
            <span className="text-[var(--muted-foreground)]">No account</span>
          ),
        header: "Company",
        id: "company",
      },
      { accessor: "email", header: "Email", id: "email" },
      { accessor: "title", header: "Title", id: "title" },
      {
        cell: (contact) => renderTags(contact.tags),
        header: "Tags",
        id: "tags",
      },
      {
        cell: (contact) => contact.owner_name ?? "Unassigned",
        header: "Owner",
        id: "owner",
      },
      {
        cell: (contact) => formatDate(contact.created_at),
        header: "Created",
        id: "created",
      },
      {
        cell: (contact) =>
          canWriteContacts ? (
            <Button
              onClick={(event) => {
                event.preventDefault();
                setArchiveContact(contact);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
              Archive
            </Button>
          ) : null,
        header: "",
        id: "actions",
      },
    ],
    [canWriteContacts],
  );

  function updateFilter(key: keyof ContactFilters, value: string) {
    setPage(1);
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={
          canWriteContacts
            ? {
                icon: Plus,
                label: "New Contact",
                onClick: () => setFormOpen(true),
              }
            : undefined
        }
        subtitle="Keep customer contacts, owners, and account links organized."
        title="Contacts"
      />

      <SavedViews
        scope="contacts"
        value={filters}
        onLoad={(saved) => {
          setFilters(saved);
          setPage(1);
        }}
      />
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.5fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(140px,0.8fr)]">
          <div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Name, email, or company"
                value={filters.search}
              />
            </div>
          </div>
          <div>
            <select
              className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
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
          </div>
          <div>
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
          <div>
            <Input
              onChange={(event) => updateFilter("tag", event.target.value)}
              placeholder="Tag name"
              value={filters.tag}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <RecordOptionsStatus query={accountsQuery} label="accounts" />
      </div>
      {contacts.length === 0 &&
      !contactsQuery.isLoading &&
      !contactsQuery.isError ? (
        <EmptyState
          action={
            canWriteContacts
              ? { label: "New Contact", onClick: () => setFormOpen(true) }
              : undefined
          }
          description="Create the first contact or adjust your filters."
          icon={Users}
          title="No contacts found"
        />
      ) : (
        <DataTable
          columns={columns}
          data={contacts}
          emptyMessage="No contacts found."
          getRowKey={(contact) => contact.id}
          isLoading={contactsQuery.isLoading}
          error={contactsQuery.isError}
          onRetry={() => contactsQuery.refetch()}
          pagination={{
            hasNextPage: contacts.length === PAGE_SIZE,
            page,
            pageSize: PAGE_SIZE,
            onPageChange: setPage,
          }}
        />
      )}

      {contactsQuery.isError ? (
        <div className="rounded-xl border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">
          Could not load contacts.
        </div>
      ) : null}

      {canWriteContacts ? (
        <ContactForm onOpenChange={setFormOpen} open={formOpen} />
      ) : null}

      {canWriteContacts ? (
        <ConfirmDialog
          confirmLabel="Confirm"
          isPending={archiveMutation.isPending}
          onConfirm={() => {
            if (archiveContact) {
              archiveMutation.mutate(archiveContact.id);
            }
          }}
          onOpenChange={(open) => {
            if (!open) {
              setArchiveContact(null);
            }
          }}
          open={Boolean(archiveContact)}
          title="Archive contact"
        />
      ) : null}
    </div>
  );
}
