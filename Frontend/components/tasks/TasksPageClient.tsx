"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isBefore } from "date-fns";
import { AlertTriangle, Archive, Check, Clock, Edit, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActivityTypeIcon } from "@/components/activities/ActivityTypeIcon";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusPill } from "@/components/shared/StatusPill";
import { SnoozeModal } from "@/components/tasks/SnoozeModal";
import { TaskForm } from "@/components/tasks/TaskForm";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { normalizeRole } from "@/lib/auth-types";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { Account, Contact, Deal, Lead, Task, TaskPriority, TaskStatus, User } from "@/types/api";

type TaskTab = "mine" | "all";
type TaskLinkedFilter = "" | "lead" | "contact" | "deal" | "account";

interface TaskFilters {
  account_id: string;
  contact_id: string;
  deal_id: string;
  lead_id: string;
  linked_type: TaskLinkedFilter;
  owner_id: string;
  status: TaskStatus | "";
}

interface LinkedRecordFilter {
  key: "account_id" | "contact_id" | "deal_id" | "lead_id";
  options: Array<{ id: string; name: string }>;
  placeholder: string;
  value: string;
}

const PAGE_SIZE = 20;
const selectClassName = "h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950 shadow-sm";

const taskStatusOptions: Array<{ label: string; value: TaskStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Pending", value: "pending" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Overdue", value: "overdue" },
];

const linkedTypeOptions: Array<{ label: string; value: TaskLinkedFilter }> = [
  { label: "Any linked record", value: "" },
  { label: "Leads", value: "lead" },
  { label: "Contacts", value: "contact" },
  { label: "Deals", value: "deal" },
  { label: "Accounts", value: "account" },
];

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value));
}

function contactName(contact: Contact): string {
  return `${contact.first_name} ${contact.last_name}`;
}

function taskQueryParams(page: number, tab: TaskTab, filters: TaskFilters, currentUserId?: string) {
  return {
    account_id: filters.linked_type === "account" ? filters.account_id || undefined : undefined,
    contact_id: filters.linked_type === "contact" ? filters.contact_id || undefined : undefined,
    deal_id: filters.linked_type === "deal" ? filters.deal_id || undefined : undefined,
    lead_id: filters.linked_type === "lead" ? filters.lead_id || undefined : undefined,
    owner_id: tab === "mine" ? currentUserId : filters.owner_id || undefined,
    overdue: filters.status === "overdue" ? true : undefined,
    page,
    page_size: PAGE_SIZE,
    status: filters.status && filters.status !== "overdue" ? filters.status : undefined,
  };
}

function priorityPill(priority: TaskPriority) {
  const tone: Record<TaskPriority, string> = {
    high: "bg-red-50 text-red-700 ring-red-100",
    low: "bg-slate-100 text-[#64748B] ring-slate-200",
    medium: "bg-blue-50 text-[#2563EB] ring-blue-100",
    urgent: "bg-red-100 text-red-800 ring-red-200",
  };

  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset", tone[priority])}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function isOverdue(task: Task): boolean {
  return Boolean(task.due_at && task.status !== "completed" && isBefore(new Date(task.due_at), new Date()));
}

export function TasksPageClient() {
  const queryClient = useQueryClient();
  const { canWriteTasks } = usePermissions();
  const session = authClient.useSession();
  const storedUser = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionUser = session.data?.user;
  const role = normalizeRole(sessionUser?.role ?? storedUser?.role);
  const canSeeAll = role === "super_admin" || role === "sales_manager";
  const fallbackSessionId = stringOrUndefined(sessionUser?.id) ?? storedUser?.id;
  const hasBackendAuth = Boolean(accessToken || sessionUser) && !session.isPending;
  const meQuery = useQuery({
    enabled: hasBackendAuth,
    queryFn: () => api.get<User>("/users/me"),
    queryKey: ["users", "me"],
    retry: 1,
  });
  const currentUserId = meQuery.data?.id ?? (hasBackendAuth && isUuid(fallbackSessionId) ? fallbackSessionId : undefined);
  const [tab, setTab] = useState<TaskTab>("mine");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<TaskFilters>({
    account_id: "",
    contact_id: "",
    deal_id: "",
    lead_id: "",
    linked_type: "",
    owner_id: "",
    status: "",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [snoozingTask, setSnoozingTask] = useState<Task | null>(null);
  const [archivingTask, setArchivingTask] = useState<Task | null>(null);
  const [completedTaskId, setCompletedTaskId] = useState<string | null>(null);

  const tasksQuery = useQuery({
    enabled: hasBackendAuth && (tab === "all" || Boolean(currentUserId)),
    queryFn: () => api.get<Task[]>("/tasks/", taskQueryParams(page, tab, filters, currentUserId)),
    queryKey: ["tasks", "list", tab, currentUserId, page, filters],
  });
  const overdueQuery = useQuery({
    enabled: hasBackendAuth && (tab === "all" || Boolean(currentUserId)),
    queryFn: () => api.get<Task[]>("/tasks/overdue", { owner_id: tab === "mine" ? currentUserId : undefined, page_size: 100 }),
    queryKey: ["tasks", "overdue", tab, currentUserId],
  });
  const usersQuery = useQuery({
    enabled: hasBackendAuth && canSeeAll,
    queryFn: () => api.get<User[]>("/users/"),
    queryKey: ["users", "task-page"],
    retry: false,
  });
  const leadsQuery = useQuery({
    enabled: hasBackendAuth,
    queryFn: () => api.get<Lead[]>("/leads/", { page_size: 100 }),
    queryKey: ["leads", "task-page"],
  });
  const contactsQuery = useQuery({
    enabled: hasBackendAuth,
    queryFn: () => api.get<Contact[]>("/contacts/", { page_size: 100 }),
    queryKey: ["contacts", "task-page"],
  });
  const dealsQuery = useQuery({
    enabled: hasBackendAuth,
    queryFn: () => api.get<Deal[]>("/deals/", { page_size: 100 }),
    queryKey: ["deals", "task-page"],
  });
  const accountsQuery = useQuery({
    enabled: hasBackendAuth,
    queryFn: () => api.get<Account[]>("/accounts/", { page_size: 100 }),
    queryKey: ["accounts", "task-page"],
  });

  const completeTask = useMutation({
    mutationFn: (id: string) => api.post<Task>(`/tasks/${id}/complete`),
    onMutate: async (id) => {
      const listKey = ["tasks", "list", tab, currentUserId, page, filters] as const;
      const overdueKey = ["tasks", "overdue", tab, currentUserId] as const;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: overdueKey }),
      ]);
      const previousTasks = queryClient.getQueryData<Task[]>(listKey);
      const previousOverdue = queryClient.getQueryData<Task[]>(overdueKey);
      const completedAt = new Date().toISOString();

      queryClient.setQueryData<Task[]>(listKey, (current) =>
        (current ?? []).map((task) => (task.id === id ? { ...task, completed_at: completedAt, status: "completed" } : task)),
      );
      queryClient.setQueryData<Task[]>(overdueKey, (current) => (current ?? []).filter((task) => task.id !== id));

      return { listKey, overdueKey, previousOverdue, previousTasks };
    },
    onError: (_error, _id, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(context.listKey, context.previousTasks);
      }
      if (context?.previousOverdue) {
        queryClient.setQueryData(context.overdueKey, context.previousOverdue);
      }
    },
    onSuccess: (_task, id) => {
      setCompletedTaskId(id);
      window.setTimeout(() => setCompletedTaskId(null), 800);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const archiveTask = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tasks/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setArchivingTask(null);
    },
  });

  const userMap = useMemo(() => new Map((usersQuery.data ?? []).map((user) => [user.id, user.full_name])), [usersQuery.data]);
  const leadMap = useMemo(() => new Map((leadsQuery.data ?? []).map((lead) => [lead.id, lead.full_name])), [leadsQuery.data]);
  const contactMap = useMemo(() => new Map((contactsQuery.data ?? []).map((contact) => [contact.id, contactName(contact)])), [contactsQuery.data]);
  const dealMap = useMemo(() => new Map((dealsQuery.data ?? []).map((deal) => [deal.id, deal.title])), [dealsQuery.data]);
  const accountMap = useMemo(() => new Map((accountsQuery.data ?? []).map((account) => [account.id, account.name])), [accountsQuery.data]);

  const tasks = tasksQuery.data ?? [];
  const overdueCount = overdueQuery.data?.length ?? 0;
  const linkedRecordFilter: LinkedRecordFilter | null = (() => {
    switch (filters.linked_type) {
      case "account":
        return {
          key: "account_id",
          options: (accountsQuery.data ?? []).map((account) => ({ id: account.id, name: account.name })),
          placeholder: "All accounts",
          value: filters.account_id,
        };
      case "contact":
        return {
          key: "contact_id",
          options: (contactsQuery.data ?? []).map((contact) => ({ id: contact.id, name: contactName(contact) })),
          placeholder: "All contacts",
          value: filters.contact_id,
        };
      case "deal":
        return {
          key: "deal_id",
          options: (dealsQuery.data ?? []).map((deal) => ({ id: deal.id, name: deal.title })),
          placeholder: "All deals",
          value: filters.deal_id,
        };
      case "lead":
        return {
          key: "lead_id",
          options: (leadsQuery.data ?? []).map((lead) => ({ id: lead.id, name: lead.full_name })),
          placeholder: "All leads",
          value: filters.lead_id,
        };
      default:
        return null;
    }
  })();

  const columns = useMemo<Array<DataTableColumn<Task>>>(
    () => [
      { cell: (task) => priorityPill(task.priority), header: "Priority", id: "priority" },
      { accessor: "title", header: "Title", id: "title" },
      { cell: (task) => <ActivityTypeIcon className="h-5 w-5 text-[#2563EB]" type={task.type ?? "task"} />, header: "Type", id: "type" },
      {
        cell: (task) => {
          if (task.contact_id) return <Link className="text-[#2563EB] hover:underline" href={`/contacts/${task.contact_id}`}>{task.contact_name ?? contactMap.get(task.contact_id) ?? "Contact"}</Link>;
          if (task.deal_id) return <Link className="text-[#2563EB] hover:underline" href={`/deals/${task.deal_id}`}>{task.deal_name ?? dealMap.get(task.deal_id) ?? "Deal"}</Link>;
          if (task.lead_id) return <Link className="text-[#2563EB] hover:underline" href={`/leads/${task.lead_id}`}>{task.lead_name ?? leadMap.get(task.lead_id) ?? "Lead"}</Link>;
          if (task.account_id) return <Link className="text-[#2563EB] hover:underline" href={`/accounts/${task.account_id}`}>{task.account_name ?? accountMap.get(task.account_id) ?? "Account"}</Link>;
          return <span className="text-[#64748B]">No link</span>;
        },
        header: "Linked To",
        id: "linked",
      },
      { cell: (task) => task.owner_name ?? task.assigned_to_name ?? userMap.get(task.owner_id) ?? "Unassigned", header: "Assigned To", id: "assigned" },
      {
        cell: (task) => {
          const overdue = isOverdue(task);
          return (
            <span className={cn("inline-flex items-center gap-1 font-medium", overdue ? "text-red-600" : "text-[#64748B]")}>
              {overdue ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : null}
              {task.due_at ? formatDate(task.due_at) : "No due date"}
            </span>
          );
        },
        header: "Due Date",
        id: "due",
      },
      { cell: (task) => <StatusPill status={isOverdue(task) ? "overdue" : task.status} type="task" />, header: "Status", id: "status" },
      {
        cell: (task) => canWriteTasks ? (
          <div className="relative flex items-center gap-1.5">
            {completedTaskId === task.id ? (
              <span className="task-complete-pop pointer-events-none absolute -left-10 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                Done
              </span>
            ) : null}
            <Button disabled={task.status === "completed" || completeTask.isPending} onClick={() => completeTask.mutate(task.id)} size="icon" type="button" variant="ghost">
              <Check className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Complete</span>
            </Button>
            <Button onClick={() => setSnoozingTask(task)} size="icon" type="button" variant="ghost">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Snooze</span>
            </Button>
            <Button onClick={() => setEditingTask(task)} size="icon" type="button" variant="ghost">
              <Edit className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Edit</span>
            </Button>
            <Button className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setArchivingTask(task)} size="icon" type="button" variant="ghost">
              <Archive className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Archive</span>
            </Button>
          </div>
        ) : null,
        header: "Actions",
        id: "actions",
      },
    ],
    [accountMap, canWriteTasks, completeTask, completedTaskId, contactMap, dealMap, leadMap, userMap],
  );

  function changeTab(nextTab: TaskTab) {
    setTab(nextTab);
    setPage(1);
  }

  function updateFilter(key: keyof TaskFilters, value: string) {
    setPage(1);
    setFilters((currentFilters) => {
      if (key === "linked_type") {
        return {
          ...currentFilters,
          account_id: "",
          contact_id: "",
          deal_id: "",
          lead_id: "",
          linked_type: value as TaskLinkedFilter,
        };
      }

      return { ...currentFilters, [key]: value };
    });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={canWriteTasks ? { icon: Plus, label: "New Task", onClick: () => setFormOpen(true) } : undefined}
        subtitle="Prioritize follow-ups, due dates, and ownership across CRM records."
        title="Tasks"
      />

      {overdueCount > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-white px-4 py-3 text-sm text-red-700 shadow-sm">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="font-semibold">
            {overdueCount} overdue task{overdueCount === 1 ? "" : "s"} need attention.
          </span>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-flex w-fit rounded-lg bg-slate-100 p-1">
            <button className={cn("rounded-md px-4 py-2 text-sm font-semibold transition-colors", tab === "mine" ? "bg-white text-[#0F2444] shadow-sm" : "text-[#64748B] hover:text-[#0F2444]")} onClick={() => changeTab("mine")} type="button">
              My Tasks
            </button>
            {canSeeAll ? (
              <button className={cn("rounded-md px-4 py-2 text-sm font-semibold transition-colors", tab === "all" ? "bg-white text-[#0F2444] shadow-sm" : "text-[#64748B] hover:text-[#0F2444]")} onClick={() => changeTab("all")} type="button">
                All Tasks
              </button>
            ) : null}
          </div>

          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <select className={selectClassName} onChange={(event) => updateFilter("status", event.target.value)} value={filters.status}>
              {taskStatusOptions.map((status) => (
                <option key={status.value || "all"} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            {canSeeAll && tab === "all" ? (
              <select className={selectClassName} onChange={(event) => updateFilter("owner_id", event.target.value)} value={filters.owner_id}>
                <option value="">All owners</option>
                {(usersQuery.data ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </select>
            ) : null}
            <select className={selectClassName} onChange={(event) => updateFilter("linked_type", event.target.value)} value={filters.linked_type}>
              {linkedTypeOptions.map((linkedType) => (
                <option key={linkedType.value || "all"} value={linkedType.value}>
                  {linkedType.label}
                </option>
              ))}
            </select>
            {linkedRecordFilter ? (
              <select className={selectClassName} onChange={(event) => updateFilter(linkedRecordFilter.key, event.target.value)} value={linkedRecordFilter.value}>
                <option value="">{linkedRecordFilter.placeholder}</option>
                {linkedRecordFilter.options.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="hidden xl:block" aria-hidden="true" />
            )}
          </div>
        </div>
      </section>

      {hasBackendAuth && !currentUserId && tab === "mine" && meQuery.isError ? (
        <div className="rounded-xl border border-amber-100 bg-white p-4 text-sm text-amber-800 shadow-sm">Could not identify the backend user session yet.</div>
      ) : null}

      <DataTable
        columns={columns}
        data={tasks}
        emptyMessage="No tasks found."
        getRowKey={(task) => task.id}
        isLoading={tasksQuery.isLoading}
        pagination={{ hasNextPage: tasks.length === PAGE_SIZE, page, pageSize: PAGE_SIZE, onPageChange: setPage }}
      />

      {tasksQuery.isError ? <div className="rounded-xl border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">Could not load tasks.</div> : null}

      {canWriteTasks ? (
        <>
          <TaskForm onOpenChange={setFormOpen} open={formOpen} />
          <TaskForm onOpenChange={(open) => (!open ? setEditingTask(null) : undefined)} open={Boolean(editingTask)} task={editingTask} />
          <SnoozeModal onOpenChange={(open) => (!open ? setSnoozingTask(null) : undefined)} open={Boolean(snoozingTask)} task={snoozingTask} />
          <ConfirmDialog
            confirmLabel="Archive"
            description="Remove this task from the active task list. This cannot be undone."
            isPending={archiveTask.isPending}
            onConfirm={() => {
              if (archivingTask) {
                archiveTask.mutate(archivingTask.id);
              }
            }}
            onOpenChange={(open) => {
              if (!open) {
                setArchivingTask(null);
              }
            }}
            open={Boolean(archivingTask)}
            title="Archive task"
          />
        </>
      ) : null}
    </div>
  );
}
