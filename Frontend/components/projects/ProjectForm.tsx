"use client";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  useRecordOptions,
  RecordOptionsStatus,
} from "@/hooks/useRecordOptions";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api, apiErrorDetail } from "@/lib/api";
import type {
  Account,
  Project,
  ProjectCreate,
  ProjectUpdate,
  User,
} from "@/types/api";

const projectFormSchema = z.object({
  account_id: z.string().min(1, "Account is required."),
  end_date: z.string().min(1, "End date is required."),
  name: z.string().min(1, "Name is required."),
  owner_id: z.string().optional(),
  start_date: z.string().min(1, "Start date is required."),
});
const dateInputClassName =
  "[color-scheme:light] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100";

type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface ProjectFormProps {
  onOpenChange: (open: boolean) => void;
  onSaved?: (project: Project) => void;
  open: boolean;
  project?: Project | null;
}

interface AccountOption {
  id: string;
  name: string;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 45);
  return date.toISOString().slice(0, 10);
}

function valuesFromProject(project?: Project | null): ProjectFormValues {
  return {
    account_id: project?.account_id ?? "",
    end_date: project?.end_date ?? defaultEndDate(),
    name: project?.name ?? "",
    owner_id: project?.owner_id ?? "",
    start_date: project?.start_date ?? today(),
  };
}

function fieldError(message?: string, field?: string) {
  return message ? (
    <p
      id={field ? `${field}-error` : undefined}
      role="alert"
      className="mt-1 text-xs text-red-600"
    >
      {message}
    </p>
  ) : null;
}

function buildCreatePayload(values: ProjectFormValues): ProjectCreate {
  return {
    account_id: values.account_id,
    end_date: values.end_date,
    health: "green",
    name: values.name,
    owner_id: values.owner_id || null,
    start_date: values.start_date,
    status: "active",
  };
}

function buildUpdatePayload(values: ProjectFormValues): ProjectUpdate {
  return {
    end_date: values.end_date,
    name: values.name,
    owner_id: values.owner_id || null,
    start_date: values.start_date,
  };
}

export function ProjectForm({
  onOpenChange,
  onSaved,
  open,
  project,
}: ProjectFormProps) {
  const queryClient = useQueryClient();
  const [accountSearch, setAccountSearch] = useState(
    project?.account_name ?? "",
  );
  const debouncedAccountSearch = useDebouncedValue(accountSearch, 300);
  const form = useForm<ProjectFormValues>({
    defaultValues: valuesFromProject(project),
    resolver: zodResolver(projectFormSchema),
  });
  const confirmDiscard = useUnsavedChanges(open && form.formState.isDirty);
  const handleOpenChange = (next: boolean) => {
    if (next || confirmDiscard()) onOpenChange(next);
  };

  useEffect(() => {
    if (open) {
      form.reset(valuesFromProject(project));
      setAccountSearch(project?.account_name ?? "");
    }
  }, [form, open, project]);

  const accountsQuery = useRecordOptions<Account>(
    "/accounts/",
    { page_size: 100, search: debouncedAccountSearch || undefined },
    ["accounts", "project-form", debouncedAccountSearch],
  );
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/directory"),
    queryKey: ["users", "project-form"],
    retry: false,
  });

  const accountOptions = useMemo<AccountOption[]>(() => {
    const options = (accountsQuery.data ?? []).map((account) => ({
      id: account.id,
      name: account.name,
    }));

    if (
      project?.account_id &&
      project.account_name &&
      !options.some((account) => account.id === project.account_id)
    ) {
      options.unshift({ id: project.account_id, name: project.account_name });
    }

    const normalizedSearch = debouncedAccountSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return options;
    }

    return options.filter((account) =>
      account.name.toLowerCase().includes(normalizedSearch),
    );
  }, [
    accountsQuery.data,
    debouncedAccountSearch,
    project?.account_id,
    project?.account_name,
  ]);

  const saveProject = useMutation({
    mutationFn: (values: ProjectFormValues) => {
      if (project) {
        return api.patch<Project, ProjectUpdate>(
          `/projects/${project.id}`,
          buildUpdatePayload(values),
        );
      }

      return api.post<Project, ProjectCreate>(
        "/projects/",
        buildCreatePayload(values),
      );
    },
    onSuccess: (savedProject) => {
      form.reset(form.getValues());
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      onSaved?.(savedProject);
      onOpenChange(false);
    },
  });

  const submitting = saveProject.isPending;

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{project ? "Edit Project" : "New Project"}</SheetTitle>
          <SheetDescription>
            {project
              ? "Update project ownership and timeline."
              : "Create a customer delivery project."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={form.handleSubmit((values) => saveProject.mutate(values))}
        >
          <SheetBody className="space-y-5">
            <div>
              <Label htmlFor="project_name">Name</Label>
              <Input
                id="project_name"
                disabled={submitting}
                aria-invalid={Boolean(form.formState.errors.name)}
                aria-describedby={
                  form.formState.errors.name ? "name-error" : undefined
                }
                {...form.register("name")}
              />
              {fieldError(form.formState.errors.name?.message, "name")}
            </div>

            <div>
              <Label htmlFor="project_account_search">Account</Label>
              <Input
                id="project_account_search"
                disabled={submitting || Boolean(project)}
                onChange={(event) => setAccountSearch(event.target.value)}
                aria-label="Search accounts"
                placeholder="Search accounts"
                value={accountSearch}
              />
              <select
                className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                disabled={submitting || Boolean(project)}
                aria-invalid={Boolean(form.formState.errors.account_id)}
                aria-describedby={
                  form.formState.errors.account_id
                    ? "account_id-error"
                    : undefined
                }
                aria-label="Account"
                {...form.register("account_id")}
              >
                <option value="">Choose account</option>
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              {fieldError(
                form.formState.errors.account_id?.message,
                "account_id",
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="project_start_date">Start Date</Label>
                <Input
                  className={dateInputClassName}
                  id="project_start_date"
                  disabled={submitting}
                  type="date"
                  aria-invalid={Boolean(form.formState.errors.start_date)}
                  aria-describedby={
                    form.formState.errors.start_date
                      ? "start_date-error"
                      : undefined
                  }
                  {...form.register("start_date")}
                />
                {fieldError(
                  form.formState.errors.start_date?.message,
                  "start_date",
                )}
              </div>
              <div>
                <Label htmlFor="project_end_date">End Date</Label>
                <Input
                  className={dateInputClassName}
                  id="project_end_date"
                  disabled={submitting}
                  type="date"
                  aria-invalid={Boolean(form.formState.errors.end_date)}
                  aria-describedby={
                    form.formState.errors.end_date
                      ? "end_date-error"
                      : undefined
                  }
                  {...form.register("end_date")}
                />
                {fieldError(
                  form.formState.errors.end_date?.message,
                  "end_date",
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="project_owner">Owner</Label>
              <select
                className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                disabled={submitting}
                id="project_owner"
                aria-invalid={Boolean(form.formState.errors.owner_id)}
                aria-describedby={
                  form.formState.errors.owner_id ? "owner_id-error" : undefined
                }
                {...form.register("owner_id")}
              >
                <option value="">Current user</option>
                {(usersQuery.data ?? [])
                  .filter((user) => user.is_active)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
              </select>
            </div>

            {saveProject.isError ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {apiErrorDetail(saveProject.error, "Could not save project.")}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <RecordOptionsStatus query={accountsQuery} label="accounts" />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-[var(--primary)] hover:bg-blue-700"
              disabled={submitting}
              type="submit"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Project
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
