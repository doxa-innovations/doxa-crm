"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FileUp, Plus, Search, UserCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AssignLeadDialog } from "@/components/leads/AssignLeadDialog";
import { ConvertModal } from "@/components/leads/ConvertModal";
import { DuplicatesView } from "@/components/leads/DuplicatesView";
import { ImportModal } from "@/components/leads/ImportModal";
import { LeadForm } from "@/components/leads/LeadForm";
import { LeadScoreBar } from "@/components/leads/LeadScoreBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type { DuplicateLeadPair, Lead, LeadSource, LeadStatus, User } from "@/types/api";

const PAGE_SIZE = 20;
const leadStatuses: LeadStatus[] = ["new", "contacted", "qualified", "disqualified", "converted"];
const leadSources: LeadSource[] = ["website", "referral", "social", "cold_outreach", "event", "campaign"];

interface LeadFilters {
  assigned_to: string;
  max_score: string;
  min_score: string;
  source: string;
  status: string;
}

interface LeadsPageClientProps {
  view?: string;
}

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourcePill(source: string) {
  return <span className="rounded-full bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#2563EB]">{optionLabel(source)}</span>;
}

function toQueryParams(page: number, filters: LeadFilters) {
  return {
    assigned_to: filters.assigned_to || undefined,
    max_score: filters.max_score ? Number(filters.max_score) : undefined,
    min_score: filters.min_score ? Number(filters.min_score) : undefined,
    page,
    page_size: PAGE_SIZE,
    exclude_converted: filters.status ? undefined : true,
    source: filters.source || undefined,
    status: filters.status || undefined,
  };
}

export function LeadsPageClient({ view }: LeadsPageClientProps) {
  const queryClient = useQueryClient();
  const { canWriteLeads } = usePermissions();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<LeadFilters>({
    assigned_to: "",
    max_score: "",
    min_score: "",
    source: "",
    status: "",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const leadsQuery = useQuery({
    queryFn: () => api.get<Lead[]>("/leads/", toQueryParams(page, filters)),
    queryKey: ["leads", "list", page, filters],
  });
  const duplicatesQuery = useQuery({
    queryFn: () => api.get<DuplicateLeadPair[]>("/leads/duplicates", { page_size: 100 }),
    queryKey: ["leads", "duplicates", "banner"],
  });
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/"),
    queryKey: ["users", "lead-filter-options"],
    retry: false,
  });
  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.delete<void>(`/leads/${id}`)));
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const leads = leadsQuery.data ?? [];
  const allPageSelected = leads.length > 0 && leads.every((lead) => selectedIds.has(lead.id));
  const duplicateCount = duplicatesQuery.data?.length ?? 0;
  const duplicateView = view === "duplicates";

  const columns = useMemo<Array<DataTableColumn<Lead>>>(
    () => [
      ...(canWriteLeads
        ? [
            {
              cell: (lead: Lead) => (
                <input
                  aria-label={`Select ${lead.full_name}`}
                  checked={selectedIds.has(lead.id)}
                  className="h-4 w-4 rounded border-slate-300"
                  onChange={(event) => {
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) {
                        next.add(lead.id);
                      } else {
                        next.delete(lead.id);
                      }
                      return next;
                    });
                  }}
                  type="checkbox"
                />
              ),
              header: (
                <input
                  aria-label="Select all leads on page"
                  checked={allPageSelected}
                  className="h-4 w-4 rounded border-slate-300"
                  onChange={(event) => {
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      leads.forEach((lead) => {
                        if (event.target.checked) {
                          next.add(lead.id);
                        } else {
                          next.delete(lead.id);
                        }
                      });
                      return next;
                    });
                  }}
                  type="checkbox"
                />
              ),
              id: "select",
            },
          ]
        : []),
      {
        cell: (lead) => (
          <Link className="font-semibold text-[#0F2444] hover:text-[#2563EB]" href={`/leads/${lead.id}`}>
            {lead.full_name}
          </Link>
        ),
        header: "Name",
        id: "name",
      },
      { accessor: "company", header: "Company", id: "company" },
      { accessor: "email", header: "Email", id: "email" },
      { cell: (lead) => sourcePill(lead.source), header: "Source", id: "source" },
      { cell: (lead) => <LeadScoreBar score={lead.score} />, header: "Score", id: "score" },
      { cell: (lead) => <StatusPill status={lead.status} type="lead" />, header: "Status", id: "status" },
      { cell: (lead) => lead.assigned_to_name ?? "Unassigned", header: "Assigned To", id: "assigned" },
      { cell: (lead) => formatDate(lead.created_at), header: "Created", id: "created" },
      ...(canWriteLeads
        ? [
            {
              cell: (lead: Lead) => (
                <Button onClick={() => setConvertLead(lead)} size="sm" type="button" variant="outline">
                  {lead.status === "converted" ? "Contact" : "Convert"}
                </Button>
              ),
              header: "",
              id: "actions",
            },
          ]
        : []),
    ],
    [allPageSelected, canWriteLeads, leads, selectedIds],
  );

  function updateFilter(key: keyof LeadFilters, value: string) {
    setPage(1);
    setSelectedIds(new Set());
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={canWriteLeads ? { icon: Plus, label: "New Lead", onClick: () => setFormOpen(true) } : undefined}
        subtitle="Review incoming leads, ownership, and conversion readiness."
        title="Leads"
      />

      {canWriteLeads ? (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setImportOpen(true)} type="button" variant="outline">
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Import CSV
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#64748B] shadow-sm">
          You have read-only access. You can view leads, but cannot create, edit, delete, assign, score, import, merge, or convert them.
        </div>
      )}

      {duplicateCount > 0 && !duplicateView ? (
        <Link
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100"
          href="/leads?view=duplicates"
        >
          {duplicateCount} potential duplicate leads found - Review duplicates
        </Link>
      ) : null}

      {duplicateView ? (
        <DuplicatesView canWriteLeads={canWriteLeads} />
      ) : (
        <>
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(180px,1fr)_minmax(120px,0.7fr)_minmax(120px,0.7fr)]">
              <div>
                <select
                  className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  onChange={(event) => updateFilter("status", event.target.value)}
                  value={filters.status}
                >
                  <option value="">All statuses</option>
                  {leadStatuses.map((status) => (
                    <option key={status} value={status}>
                      {optionLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  onChange={(event) => updateFilter("source", event.target.value)}
                  value={filters.source}
                >
                  <option value="">All sources</option>
                  {leadSources.map((source) => (
                    <option key={source} value={source}>
                      {optionLabel(source)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  onChange={(event) => updateFilter("assigned_to", event.target.value)}
                  value={filters.assigned_to}
                >
                  <option value="">All assignees</option>
                  {(usersQuery.data ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" aria-hidden="true" />
                  <Input
                    className="pl-9"
                    max={100}
                    min={0}
                    onChange={(event) => updateFilter("min_score", event.target.value)}
                    placeholder="0"
                    type="number"
                    value={filters.min_score}
                  />
                </div>
              </div>
              <div>
                <Input
                  max={100}
                  min={0}
                  onChange={(event) => updateFilter("max_score", event.target.value)}
                  placeholder="100"
                  type="number"
                  value={filters.max_score}
                />
              </div>
            </div>
          </section>

          {canWriteLeads && selectedIds.size > 0 ? (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-sm font-medium text-[#0F2444]">{selectedIds.size} selected</p>
              <div className="flex gap-2">
                <Button onClick={() => setAssignOpen(true)} size="sm" type="button" variant="outline">
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  Assign
                </Button>
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => setConfirmDeleteOpen(true)}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </section>
          ) : null}

          <DataTable
            columns={columns}
            data={leads}
            emptyMessage="No leads found."
            getRowKey={(lead) => lead.id}
            isLoading={leadsQuery.isLoading}
            pagination={{
              hasNextPage: leads.length === PAGE_SIZE,
              page,
              pageSize: PAGE_SIZE,
              onPageChange: setPage,
            }}
          />

          {leadsQuery.isError ? (
            <div className="rounded-xl border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">Could not load leads.</div>
          ) : null}
        </>
      )}

      {canWriteLeads ? (
        <>
          <LeadForm onOpenChange={setFormOpen} open={formOpen} />
          <ImportModal onOpenChange={setImportOpen} open={importOpen} />
          {convertLead ? <ConvertModal lead={convertLead} onOpenChange={(open) => (!open ? setConvertLead(null) : undefined)} open={Boolean(convertLead)} /> : null}
          <AssignLeadDialog
            leadIds={Array.from(selectedIds)}
            onAssigned={() => setSelectedIds(new Set())}
            onOpenChange={setAssignOpen}
            open={assignOpen}
          />
          <ConfirmDialog
            isPending={deleteMutation.isPending}
            onConfirm={() =>
              deleteMutation.mutate(Array.from(selectedIds), {
                onSuccess: () => setConfirmDeleteOpen(false),
              })
            }
            onOpenChange={setConfirmDeleteOpen}
            open={confirmDeleteOpen}
            title="Delete selected leads"
          />
        </>
      ) : null}
    </div>
  );
}
