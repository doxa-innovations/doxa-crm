"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Archive, BadgeDollarSign, CheckSquare, Edit, Mail, Phone, StickyNote } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActivityForm } from "@/components/activities/ActivityForm";
import { ContactForm } from "@/components/contacts/ContactForm";
import { ActivityTimeline, contactTimelineToActivityItems } from "@/components/shared/ActivityTimeline";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type { Account, Contact, ContactTimelineItem } from "@/types/api";

type TimelineFilter = "all" | "calls" | "emails" | "tasks" | "deals";
const hiddenCustomFieldKeys = new Set(["converted_from_lead_id"]);

interface ContactDetailClientProps {
  contactId: string;
}

function metadataString(item: ContactTimelineItem, key: string): string | null {
  const value = item.metadata[key];
  return typeof value === "string" ? value : null;
}

function metadataNumber(item: ContactTimelineItem, key: string): number {
  const value = item.metadata[key];
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  return 0;
}

function timelineIcon(item: ContactTimelineItem) {
  const activityType = metadataString(item, "activity_type");

  if (item.type === "deal") {
    return BadgeDollarSign;
  }

  if (item.type === "task") {
    return CheckSquare;
  }

  if (item.type === "note") {
    return StickyNote;
  }

  if (activityType === "call") {
    return Phone;
  }

  if (activityType === "email") {
    return Mail;
  }

  return Activity;
}

function timelineMatchesFilter(item: ContactTimelineItem, filter: TimelineFilter): boolean {
  const activityType = metadataString(item, "activity_type");

  if (filter === "all") {
    return true;
  }

  if (filter === "calls") {
    return activityType === "call";
  }

  if (filter === "emails") {
    return activityType === "email";
  }

  if (filter === "tasks") {
    return item.type === "task";
  }

  return item.type === "deal";
}

function customFieldEntries(contact?: Contact): Array<[string, string | number | boolean]> {
  return Object.entries(contact?.custom_fields ?? {}).filter(([key]) => !hiddenCustomFieldKeys.has(key));
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function smsConsentLabel(contact: Contact): string {
  if (contact.sms_opted_out_at) {
    return "Opted out";
  }

  return contact.sms_opted_in_at ? "Opted in" : "Not opted in";
}

export function ContactDetailClient({ contactId }: ContactDetailClientProps) {
  const queryClient = useQueryClient();
  const { canWriteContacts, canWriteActivities } = usePermissions();
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const contactQuery = useQuery({
    queryFn: () => api.get<Contact>(`/contacts/${contactId}`),
    queryKey: ["contacts", "detail", contactId],
  });
  const timelineQuery = useQuery({
    queryFn: () => api.get<ContactTimelineItem[]>(`/contacts/${contactId}/timeline`),
    queryKey: ["contacts", "timeline", contactId],
  });
  const accountQuery = useQuery({
    enabled: Boolean(contactQuery.data?.account_id),
    queryFn: () => api.get<Account>(`/accounts/${contactQuery.data?.account_id ?? ""}`),
    queryKey: ["accounts", "detail", contactQuery.data?.account_id],
  });
  const archiveMutation = useMutation({
    mutationFn: () => api.delete<void>(`/contacts/${contactId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      window.location.href = "/contacts";
    },
  });

  const contact = contactQuery.data;
  const activityInitialLink = useMemo(
    () =>
      contact
        ? {
            id: contact.id,
            label: `${contact.first_name} ${contact.last_name}`,
            type: "contact" as const,
          }
        : undefined,
    [contact?.first_name, contact?.id, contact?.last_name],
  );
  const timeline = timelineQuery.data ?? [];
  const filteredTimeline = timeline.filter((item) => timelineMatchesFilter(item, filter));
  const openDealItems = timeline.filter((item) => item.type === "deal" && metadataString(item, "status") === "open");
  const openDealValue = openDealItems.reduce((total, item) => total + metadataNumber(item, "value"), 0);
  const tags = contact?.tags ?? [];

  const filterTabs = useMemo<Array<{ label: string; value: TimelineFilter }>>(
    () => [
      { label: "All", value: "all" },
      { label: "Calls", value: "calls" },
      { label: "Emails", value: "emails" },
      { label: "Tasks", value: "tasks" },
      { label: "Deals", value: "deals" },
    ],
    [],
  );

  if (contactQuery.isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (contactQuery.isError || !contact) {
    return <div className="rounded-xl border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">Could not load contact.</div>;
  }

  const contactSummary = [contact.title, contact.account_name ? `at ${contact.account_name}` : null].filter(Boolean).join(" ");

  return (
    <div className="grid gap-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal text-[#0F2444]">
              {contact.first_name} {contact.last_name}
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">{contactSummary || contact.email}</p>
            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span className="rounded-full bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#2563EB]" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canWriteActivities ? (
              <Button onClick={() => setActivityOpen(true)} type="button">
                <Activity className="h-4 w-4" aria-hidden="true" />
                Log Activity
              </Button>
            ) : null}
            {canWriteContacts ? (
              <>
                <Button onClick={() => setEditOpen(true)} type="button" variant="outline">
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Button>
                <Button onClick={() => setConfirmArchive(true)} type="button" variant="ghost">
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
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#0F2444]">Timeline</h2>
              <p className="mt-1 text-sm text-[#64748B]">Recent customer touchpoints and related work.</p>
            </div>
          </div>

          <div className="mt-5">
            {timelineQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((item) => (
                  <Skeleton className="h-20 rounded-lg" key={item} />
                ))}
              </div>
            ) : (
              <ActivityTimeline items={contactTimelineToActivityItems(timeline)} />
            )}
          </div>
        </section>

        <aside className="grid gap-4 content-start">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Contact Info</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[#64748B]">Email</dt>
                <dd className="mt-1 font-medium text-[#0F2444]">{contact.email}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Phone</dt>
                <dd className="mt-1 font-medium text-[#0F2444]">{contact.phone}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">SMS</dt>
                <dd className="mt-1 font-medium text-[#0F2444]">{smsConsentLabel(contact)}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Owner</dt>
                <dd className="mt-1 font-medium text-[#0F2444]">{contact.owner_name ?? "Unassigned"}</dd>
              </div>
              {customFieldEntries(contact).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[#64748B]">{formatLabel(key)}</dt>
                  <dd className="mt-1 font-medium text-[#0F2444]">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Linked Account</h2>
            {contact.account_id ? (
              <div className="mt-4">
                <Link className="font-semibold text-[#2563EB] hover:underline" href={`/accounts/${contact.account_id}`}>
                  {contact.account_name ?? accountQuery.data?.name ?? "Open account"}
                </Link>
                {accountQuery.data ? (
                  <div className="mt-3">
                    <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-[#64748B]">
                      {formatLabel(accountQuery.data.tier)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#64748B]">No account linked.</p>
            )}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Open Deals</h2>
            <p className="mt-3 text-3xl font-bold text-[#0F2444]">{openDealItems.length}</p>
            <p className="mt-1 text-sm font-medium text-[#2563EB]">{formatCurrency(openDealValue)}</p>
          </section>
        </aside>
      </div>

      {canWriteContacts ? <ContactForm contact={contact} onOpenChange={setEditOpen} onSaved={() => void contactQuery.refetch()} open={editOpen} /> : null}
      {canWriteActivities ? (
        <ActivityForm
          initialLink={activityInitialLink}
          onOpenChange={setActivityOpen}
          onSaved={() => void timelineQuery.refetch()}
          open={activityOpen}
        />
      ) : null}

      {canWriteContacts ? (
        <ConfirmDialog
          confirmLabel="Confirm"
          isPending={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutate()}
          onOpenChange={setConfirmArchive}
          open={confirmArchive}
          title="Archive contact"
        />
      ) : null}
    </div>
  );
}
