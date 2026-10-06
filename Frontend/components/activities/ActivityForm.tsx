"use client";
import {
  useRecordOptions,
  RecordOptionsStatus,
} from "@/hooks/useRecordOptions";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { toLocalDateTime } from "@/lib/utils";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ActivityTypeIcon } from "@/components/activities/ActivityTypeIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiErrorDetail } from "@/lib/api";
import type {
  Account,
  Activity,
  ActivityCreate,
  ActivityUpdate,
  Contact,
  Deal,
  Lead,
} from "@/types/api";

const activityTypes = ["call", "email", "meeting", "note"] as const;

const activityFormSchema = z
  .object({
    account_id: z.string().optional(),
    body: z.string().min(1, "Body is required."),
    contact_id: z.string().optional(),
    deal_id: z.string().optional(),
    duration_minutes: z.string().optional(),
    lead_id: z.string().optional(),
    outcome: z.string().optional(),
    scheduled_at: z.string().optional(),
    subject: z.string().min(1, "Subject is required."),
    type: z.enum(activityTypes),
  })
  .refine(
    (value) =>
      Boolean(
        value.lead_id || value.contact_id || value.deal_id || value.account_id,
      ),
    {
      message: "Link at least one entity.",
      path: ["lead_id"],
    },
  );

type ActivityFormValues = z.infer<typeof activityFormSchema>;

export interface ActivityInitialLink {
  type: "lead" | "contact" | "deal" | "account";
  id: string;
  label?: string | null;
}

interface ActivityFormProps {
  activity?: Activity | null;
  initialLink?: ActivityInitialLink;
  onOpenChange: (open: boolean) => void;
  onSaved?: (activity: Activity) => void;
  open: boolean;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}

function nowForInput(): string {
  return toLocalDateTime(new Date());
}

function emptyValues(initialLink?: ActivityInitialLink): ActivityFormValues {
  return {
    account_id: initialLink?.type === "account" ? initialLink.id : "",
    body: "",
    contact_id: initialLink?.type === "contact" ? initialLink.id : "",
    deal_id: initialLink?.type === "deal" ? initialLink.id : "",
    duration_minutes: "",
    lead_id: initialLink?.type === "lead" ? initialLink.id : "",
    outcome: "",
    scheduled_at: nowForInput(),
    subject: "",
    type: "call",
  };
}

function valuesFromActivity(activity: Activity): ActivityFormValues {
  return {
    account_id: activity.account_id ?? "",
    body: activity.body,
    contact_id: activity.contact_id ?? "",
    deal_id: activity.deal_id ?? "",
    duration_minutes: activity.duration_minutes
      ? String(activity.duration_minutes)
      : "",
    lead_id: activity.lead_id ?? "",
    outcome: activity.outcome ?? "",
    scheduled_at: activity.scheduled_at
      ? toLocalDateTime(activity.scheduled_at)
      : nowForInput(),
    subject: activity.subject,
    type: activity.type === "task" ? "call" : activity.type,
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

function toIsoOrNull(value?: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function buildPayload(
  values: ActivityFormValues,
  initialLink?: ActivityInitialLink,
): ActivityCreate | ActivityUpdate {
  if (initialLink) {
    return {
      account_id: initialLink.type === "account" ? initialLink.id : null,
      body: values.body,
      contact_id: initialLink.type === "contact" ? initialLink.id : null,
      deal_id: initialLink.type === "deal" ? initialLink.id : null,
      duration_minutes: values.duration_minutes
        ? Number(values.duration_minutes)
        : null,
      lead_id: initialLink.type === "lead" ? initialLink.id : null,
      outcome: values.outcome || null,
      scheduled_at: toIsoOrNull(values.scheduled_at),
      subject: values.subject,
      type: values.type,
    };
  }

  return {
    account_id: values.account_id || null,
    body: values.body,
    contact_id: values.contact_id || null,
    deal_id: values.deal_id || null,
    duration_minutes: values.duration_minutes
      ? Number(values.duration_minutes)
      : null,
    lead_id: values.lead_id || null,
    outcome: values.outcome || null,
    scheduled_at: toIsoOrNull(values.scheduled_at),
    subject: values.subject,
    type: values.type,
  };
}

function contactLabel(contact: Contact): string {
  return `${contact.first_name} ${contact.last_name}`;
}

function optionLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function linkedRecordLabel(initialLink: ActivityInitialLink): string {
  const type = optionLabel(initialLink.type);
  return initialLink.label
    ? `${type}: ${initialLink.label}`
    : `${type}: ${initialLink.id.slice(0, 8)}`;
}

export function ActivityForm({
  activity,
  initialLink,
  onOpenChange,
  onSaved,
  open,
}: ActivityFormProps) {
  const queryClient = useQueryClient();
  const [leadSearch, setLeadSearch] = useState("");
  const [contactSearch, setContactSearch] = useState(
    initialLink?.type === "contact" ? (initialLink.label ?? "") : "",
  );
  const [dealSearch, setDealSearch] = useState(
    initialLink?.type === "deal" ? (initialLink.label ?? "") : "",
  );
  const [accountSearch, setAccountSearch] = useState(
    initialLink?.type === "account" ? (initialLink.label ?? "") : "",
  );
  const debouncedLeadSearch = useDebouncedValue(leadSearch, 300);
  const debouncedContactSearch = useDebouncedValue(contactSearch, 300);
  const debouncedDealSearch = useDebouncedValue(dealSearch, 300);
  const debouncedAccountSearch = useDebouncedValue(accountSearch, 300);
  const form = useForm<ActivityFormValues>({
    defaultValues: activity
      ? valuesFromActivity(activity)
      : emptyValues(initialLink),
    resolver: zodResolver(activityFormSchema),
  });
  const confirmDiscard = useUnsavedChanges(open && form.formState.isDirty);
  const handleOpenChange = (next: boolean) => {
    if (next || confirmDiscard()) onOpenChange(next);
  };

  const selectedType = form.watch("type");

  useEffect(() => {
    if (open) {
      form.reset(
        activity ? valuesFromActivity(activity) : emptyValues(initialLink),
      );
      setLeadSearch(
        initialLink?.type === "lead" ? (initialLink.label ?? "") : "",
      );
      setContactSearch(
        initialLink?.type === "contact" ? (initialLink.label ?? "") : "",
      );
      setDealSearch(
        initialLink?.type === "deal" ? (initialLink.label ?? "") : "",
      );
      setAccountSearch(
        initialLink?.type === "account" ? (initialLink.label ?? "") : "",
      );
    }
  }, [activity, form, initialLink, open]);

  const leadsQuery = useRecordOptions<Lead>(
    "/leads/",
    { search: debouncedLeadSearch || undefined },
    ["leads", "form-options", debouncedLeadSearch],
  );
  const contactsQuery = useRecordOptions<Contact>(
    "/contacts/",
    { search: debouncedContactSearch || undefined },
    ["contacts", "form-options", debouncedContactSearch],
  );
  const dealsQuery = useRecordOptions<Deal>(
    "/deals/",
    { search: debouncedDealSearch || undefined },
    ["deals", "form-options", debouncedDealSearch],
  );
  const accountsQuery = useRecordOptions<Account>(
    "/accounts/",
    { search: debouncedAccountSearch || undefined },
    ["accounts", "form-options", debouncedAccountSearch],
  );

  const leadOptions = useMemo(() => {
    const normalized = debouncedLeadSearch.trim().toLowerCase();
    return (leadsQuery.data ?? []).filter((lead) =>
      `${lead.full_name} ${lead.company} ${lead.email}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [debouncedLeadSearch, leadsQuery.data]);
  const contactOptions = useMemo(() => {
    const normalized = debouncedContactSearch.trim().toLowerCase();
    return (contactsQuery.data ?? []).filter((contact) =>
      `${contact.first_name} ${contact.last_name} ${contact.email}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [contactsQuery.data, debouncedContactSearch]);
  const dealOptions = useMemo(() => {
    const normalized = debouncedDealSearch.trim().toLowerCase();
    return (dealsQuery.data ?? []).filter((deal) =>
      `${deal.title} ${deal.account_name ?? ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [dealsQuery.data, debouncedDealSearch]);
  const accountOptions = useMemo(() => {
    const normalized = debouncedAccountSearch.trim().toLowerCase();
    return (accountsQuery.data ?? []).filter((account) =>
      account.name.toLowerCase().includes(normalized),
    );
  }, [accountsQuery.data, debouncedAccountSearch]);

  const saveActivity = useMutation({
    mutationFn: (values: ActivityFormValues) => {
      const payload = buildPayload(values, initialLink);
      if (activity) {
        return api.patch<Activity, ActivityUpdate>(
          `/activities/${activity.id}`,
          payload as ActivityUpdate,
        );
      }

      return api.post<Activity, ActivityCreate>(
        "/activities/",
        payload as ActivityCreate,
      );
    },
    onSuccess: (activity) => {
      form.reset(form.getValues());
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({
        queryKey: ["contacts", "timeline"],
      });
      if (activity.contact_id) {
        void queryClient.invalidateQueries({
          queryKey: ["contacts", "timeline", activity.contact_id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["contacts", "detail", activity.contact_id],
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["leads", "activities"] });
      onSaved?.(activity);
      onOpenChange(false);
    },
  });

  const submitting = saveActivity.isPending;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {activity ? "Edit Activity" : "Log Activity"}
          </DialogTitle>
          <DialogDescription>
            {activity
              ? "Update this activity log."
              : initialLink
                ? "Record a call, email, meeting, or note for this record."
                : "Record a call, email, meeting, or note."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={form.handleSubmit((values) => saveActivity.mutate(values))}
        >
          <div>
            <Label htmlFor="activity_type">Type</Label>
            <div className="mt-1 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <select
                className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                disabled={submitting}
                id="activity_type"
                aria-invalid={Boolean(form.formState.errors.type)}
                aria-describedby={
                  form.formState.errors.type ? "type-error" : undefined
                }
                {...form.register("type")}
              >
                {activityTypes.map((type) => (
                  <option key={type} value={type}>
                    {optionLabel(type)}
                  </option>
                ))}
              </select>
              <div className="inline-flex h-10 min-w-28 items-center justify-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-left text-sm font-medium text-[var(--muted-foreground)]">
                <ActivityTypeIcon
                  className="h-5 w-5 shrink-0 text-[var(--primary)]"
                  type={selectedType}
                />
                <span>{optionLabel(selectedType)}</span>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="activity_subject">Subject</Label>
            <Input
              id="activity_subject"
              disabled={submitting}
              aria-invalid={Boolean(form.formState.errors.subject)}
              aria-describedby={
                form.formState.errors.subject ? "subject-error" : undefined
              }
              {...form.register("subject")}
            />
            {fieldError(form.formState.errors.subject?.message, "subject")}
          </div>

          <div>
            <Label htmlFor="activity_body">Body / Notes</Label>
            <textarea
              className="min-h-28 w-full rounded-md border border-[var(--input)] bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              disabled={submitting}
              id="activity_body"
              aria-invalid={Boolean(form.formState.errors.body)}
              aria-describedby={
                form.formState.errors.body ? "body-error" : undefined
              }
              {...form.register("body")}
            />
            {fieldError(form.formState.errors.body?.message, "body")}
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(240px,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <Label htmlFor="activity_scheduled_at">Scheduled At</Label>
              <Input
                className="[color-scheme:light] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100"
                id="activity_scheduled_at"
                disabled={submitting}
                type="datetime-local"
                aria-invalid={Boolean(form.formState.errors.scheduled_at)}
                aria-describedby={
                  form.formState.errors.scheduled_at
                    ? "scheduled_at-error"
                    : undefined
                }
                {...form.register("scheduled_at")}
              />
            </div>
            <div>
              <Label htmlFor="activity_outcome">Outcome</Label>
              <Input
                id="activity_outcome"
                disabled={submitting}
                aria-invalid={Boolean(form.formState.errors.outcome)}
                aria-describedby={
                  form.formState.errors.outcome ? "outcome-error" : undefined
                }
                {...form.register("outcome")}
              />
            </div>
            <div>
              <Label htmlFor="activity_duration">Duration in minutes</Label>
              <Input
                id="activity_duration"
                disabled={submitting || selectedType !== "call"}
                min="0"
                type="number"
                aria-invalid={Boolean(form.formState.errors.duration_minutes)}
                aria-describedby={
                  form.formState.errors.duration_minutes
                    ? "duration_minutes-error"
                    : undefined
                }
                {...form.register("duration_minutes")}
              />
            </div>
          </div>

          {initialLink ? (
            <div>
              <Label>Linked Record</Label>
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-[var(--navy)]">
                {linkedRecordLabel(initialLink)}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Lead</Label>
                <Input
                  disabled={submitting}
                  onChange={(event) => setLeadSearch(event.target.value)}
                  aria-label="Search leads"
                  placeholder="Search leads"
                  value={leadSearch}
                />
                <select
                  className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm"
                  disabled={submitting}
                  aria-invalid={Boolean(form.formState.errors.lead_id)}
                  aria-describedby={
                    form.formState.errors.lead_id ? "lead_id-error" : undefined
                  }
                  aria-label="Lead"
                  {...form.register("lead_id")}
                >
                  <option value="">No lead</option>
                  {leadOptions.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Contact</Label>
                <Input
                  disabled={submitting}
                  onChange={(event) => setContactSearch(event.target.value)}
                  aria-label="Search contacts"
                  placeholder="Search contacts"
                  value={contactSearch}
                />
                <select
                  className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm"
                  disabled={submitting}
                  aria-invalid={Boolean(form.formState.errors.contact_id)}
                  aria-describedby={
                    form.formState.errors.contact_id
                      ? "contact_id-error"
                      : undefined
                  }
                  aria-label="Contact"
                  {...form.register("contact_id")}
                >
                  <option value="">No contact</option>
                  {contactOptions.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contactLabel(contact)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Deal</Label>
                <Input
                  disabled={submitting}
                  onChange={(event) => setDealSearch(event.target.value)}
                  aria-label="Search deals"
                  placeholder="Search deals"
                  value={dealSearch}
                />
                <select
                  className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm"
                  disabled={submitting}
                  aria-invalid={Boolean(form.formState.errors.deal_id)}
                  aria-describedby={
                    form.formState.errors.deal_id ? "deal_id-error" : undefined
                  }
                  aria-label="Deal"
                  {...form.register("deal_id")}
                >
                  <option value="">No deal</option>
                  {dealOptions.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Account</Label>
                <Input
                  disabled={submitting}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  aria-label="Search accounts"
                  placeholder="Search accounts"
                  value={accountSearch}
                />
                <select
                  className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm"
                  disabled={submitting}
                  aria-invalid={Boolean(form.formState.errors.account_id)}
                  aria-describedby={
                    form.formState.errors.account_id
                      ? "account_id-error"
                      : undefined
                  }
                  aria-label="Account"
                  {...form.register("account_id")}
                >
                  <option value="">No account</option>
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {fieldError(form.formState.errors.lead_id?.message, "lead_id")}
          {saveActivity.isError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {apiErrorDetail(saveActivity.error, "Could not save activity.")}
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
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
              {activity ? "Update Activity" : "Save Activity"}
            </Button>
          </div>
          <RecordOptionsStatus query={leadsQuery} label="leads" />
          <RecordOptionsStatus query={contactsQuery} label="contacts" />
          <RecordOptionsStatus query={dealsQuery} label="deals" />
          <RecordOptionsStatus query={accountsQuery} label="accounts" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
