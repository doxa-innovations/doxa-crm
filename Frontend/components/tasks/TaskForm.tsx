"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import type { Account, ActivityType, Contact, Deal, Lead, StoredTaskStatus, Task, TaskCreate, TaskPriority, TaskUpdate, User } from "@/types/api";

const priorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
const taskStatuses: StoredTaskStatus[] = ["pending", "in_progress", "completed", "cancelled"];
const taskTypes: ActivityType[] = ["task", "call", "email", "meeting", "note"];

const taskFormSchema = z
  .object({
    account_id: z.string().optional(),
    contact_id: z.string().optional(),
    deal_id: z.string().optional(),
    description: z.string().optional(),
    due_at: z.string().optional(),
    lead_id: z.string().optional(),
    owner_id: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
    title: z.string().min(1, "Title is required."),
    type: z.enum(["task", "call", "email", "meeting", "note"]),
  })
  .refine((value) => Boolean(value.lead_id || value.contact_id || value.deal_id || value.account_id), {
    message: "Link at least one entity.",
    path: ["lead_id"],
  });

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormProps {
  onOpenChange: (open: boolean) => void;
  onSaved?: (task: Task) => void;
  open: boolean;
  task?: Task | null;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}

function defaultDue(): string {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return date.toISOString().slice(0, 16);
}

function valuesFromTask(task?: Task | null): TaskFormValues {
  return {
    account_id: task?.account_id ?? "",
    contact_id: task?.contact_id ?? "",
    deal_id: task?.deal_id ?? "",
    description: task?.description ?? "",
    due_at: task?.due_at ? task.due_at.slice(0, 16) : defaultDue(),
    lead_id: task?.lead_id ?? "",
    owner_id: task?.owner_id ?? "",
    priority: task?.priority ?? "medium",
    status: task?.status && task.status !== "overdue" ? task.status : "pending",
    title: task?.title ?? "",
    type: task?.type ?? "task",
  };
}

function fieldError(message?: string) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

function contactName(contact: Contact): string {
  return `${contact.first_name} ${contact.last_name}`;
}

function buildPayload(values: TaskFormValues): TaskCreate | TaskUpdate {
  return {
    account_id: values.account_id || null,
    contact_id: values.contact_id || null,
    deal_id: values.deal_id || null,
    description: values.description || null,
    due_at: values.due_at ? new Date(values.due_at).toISOString() : null,
    lead_id: values.lead_id || null,
    owner_id: values.owner_id || null,
    priority: values.priority,
    status: values.status,
    title: values.title,
    type: values.type,
  };
}

function optionLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace("_", " ");
}

export function TaskForm({ onOpenChange, onSaved, open, task }: TaskFormProps) {
  const queryClient = useQueryClient();
  const [leadSearch, setLeadSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [dealSearch, setDealSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const debouncedLeadSearch = useDebouncedValue(leadSearch, 300);
  const debouncedContactSearch = useDebouncedValue(contactSearch, 300);
  const debouncedDealSearch = useDebouncedValue(dealSearch, 300);
  const debouncedAccountSearch = useDebouncedValue(accountSearch, 300);
  const form = useForm<TaskFormValues>({
    defaultValues: valuesFromTask(task),
    resolver: zodResolver(taskFormSchema),
  });

  useEffect(() => {
    if (open) {
      form.reset(valuesFromTask(task));
    }
  }, [form, open, task]);

  const leadsQuery = useQuery({ queryFn: () => api.get<Lead[]>("/leads/", { page_size: 50 }), queryKey: ["tasks", "lead-select", debouncedLeadSearch] });
  const contactsQuery = useQuery({ queryFn: () => api.get<Contact[]>("/contacts/", { page_size: 50, search: debouncedContactSearch || undefined }), queryKey: ["tasks", "contact-select", debouncedContactSearch] });
  const dealsQuery = useQuery({ queryFn: () => api.get<Deal[]>("/deals/", { page_size: 50 }), queryKey: ["tasks", "deal-select", debouncedDealSearch] });
  const accountsQuery = useQuery({ queryFn: () => api.get<Account[]>("/accounts/", { page_size: 100, search: debouncedAccountSearch || undefined }), queryKey: ["tasks", "account-select", debouncedAccountSearch] });
  const usersQuery = useQuery({ queryFn: () => api.get<User[]>("/users/"), queryKey: ["users", "task-owner-select"], retry: false });

  const leadOptions = useMemo(() => (leadsQuery.data ?? []).filter((lead) => `${lead.full_name} ${lead.company}`.toLowerCase().includes(debouncedLeadSearch.toLowerCase())), [debouncedLeadSearch, leadsQuery.data]);
  const contactOptions = useMemo(() => (contactsQuery.data ?? []).filter((contact) => contactName(contact).toLowerCase().includes(debouncedContactSearch.toLowerCase())), [contactsQuery.data, debouncedContactSearch]);
  const dealOptions = useMemo(() => (dealsQuery.data ?? []).filter((deal) => deal.title.toLowerCase().includes(debouncedDealSearch.toLowerCase())), [dealsQuery.data, debouncedDealSearch]);
  const accountOptions = useMemo(() => (accountsQuery.data ?? []).filter((account) => account.name.toLowerCase().includes(debouncedAccountSearch.toLowerCase())), [accountsQuery.data, debouncedAccountSearch]);

  const saveTask = useMutation({
    mutationFn: (values: TaskFormValues) => {
      const payload = buildPayload(values);
      if (task) {
        return api.patch<Task, TaskUpdate>(`/tasks/${task.id}`, payload as TaskUpdate);
      }
      return api.post<Task, TaskCreate>("/tasks/", payload as TaskCreate);
    },
    onSuccess: (savedTask) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved?.(savedTask);
      onOpenChange(false);
    },
  });

  const submitting = saveTask.isPending;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{task ? "Edit Task" : "New Task"}</SheetTitle>
          <SheetDescription>{task ? "Update the task assignment and due date." : "Create a follow-up task linked to CRM records."}</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit((values) => saveTask.mutate(values))}>
          <SheetBody className="space-y-5">
            <div>
              <Label htmlFor="task_title">Title</Label>
              <Input id="task_title" disabled={submitting} {...form.register("title")} />
              {fieldError(form.formState.errors.title?.message)}
            </div>
            <div>
              <Label htmlFor="task_description">Description</Label>
              <textarea className="min-h-24 w-full rounded-md border border-[var(--input)] px-3 py-2 text-sm" disabled={submitting} id="task_description" {...form.register("description")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="task_type">Type</Label>
                <select className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm" disabled={submitting} id="task_type" {...form.register("type")}>
                  {taskTypes.map((type) => <option key={type} value={type}>{optionLabel(type)}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="task_status">Status</Label>
                <select className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm" disabled={submitting} id="task_status" {...form.register("status")}>
                  {taskStatuses.map((status) => <option key={status} value={status}>{optionLabel(status)}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="task_priority">Priority</Label>
                <select className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm" disabled={submitting} id="task_priority" {...form.register("priority")}>
                  {priorities.map((priority) => <option key={priority} value={priority}>{optionLabel(priority)}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="task_due_at">Due At</Label>
                <Input
                  className="[color-scheme:light] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100"
                  id="task_due_at"
                  disabled={submitting}
                  type="datetime-local"
                  {...form.register("due_at")}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="task_owner">Assigned To</Label>
              <select className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm" disabled={submitting} id="task_owner" {...form.register("owner_id")}>
                <option value="">Current user</option>
                {(usersQuery.data ?? []).filter((user) => user.is_active).map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Lead</Label>
                <Input disabled={submitting} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Search leads" value={leadSearch} />
                <select className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm" disabled={submitting} {...form.register("lead_id")}>
                  <option value="">No lead</option>
                  {leadOptions.map((lead) => <option key={lead.id} value={lead.id}>{lead.full_name}</option>)}
                </select>
              </div>
              <div>
                <Label>Contact</Label>
                <Input disabled={submitting} onChange={(event) => setContactSearch(event.target.value)} placeholder="Search contacts" value={contactSearch} />
                <select className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm" disabled={submitting} {...form.register("contact_id")}>
                  <option value="">No contact</option>
                  {contactOptions.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}
                </select>
              </div>
              <div>
                <Label>Deal</Label>
                <Input disabled={submitting} onChange={(event) => setDealSearch(event.target.value)} placeholder="Search deals" value={dealSearch} />
                <select className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm" disabled={submitting} {...form.register("deal_id")}>
                  <option value="">No deal</option>
                  {dealOptions.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}
                </select>
              </div>
              <div>
                <Label>Account</Label>
                <Input disabled={submitting} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Search accounts" value={accountSearch} />
                <select className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm" disabled={submitting} {...form.register("account_id")}>
                  <option value="">No account</option>
                  {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </div>
            </div>
            {fieldError(form.formState.errors.lead_id?.message)}
            {saveTask.isError ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Could not save task.</div> : null}
          </SheetBody>
          <SheetFooter>
            <Button disabled={submitting} onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
            <Button className="bg-[#2563EB] hover:bg-blue-700" disabled={submitting} type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Task
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
