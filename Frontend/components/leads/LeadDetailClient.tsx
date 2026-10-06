"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Edit, RefreshCcw, Repeat2, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { ActivityForm } from "@/components/activities/ActivityForm";
import { AssignLeadDialog } from "@/components/leads/AssignLeadDialog";
import { ConvertModal } from "@/components/leads/ConvertModal";
import { LeadForm } from "@/components/leads/LeadForm";
import { LeadScoreBar } from "@/components/leads/LeadScoreBar";
import {
  ActivityTimeline,
  type ActivityTimelineItem,
} from "@/components/shared/ActivityTimeline";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type {
  Activity as ActivityRecord,
  Lead,
  LeadScoreResponse,
} from "@/types/api";

interface LeadDetailClientProps {
  leadId: string;
}

function sourceLabel(source: string): string {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lifecycleItems(lead: Lead) {
  const items = [
    {
      detail: `Lead entered as ${sourceLabel(lead.source)}.`,
      label: "Created",
      timestamp: lead.created_at,
    },
  ];

  if (lead.updated_at !== lead.created_at) {
    items.push({
      detail: `Current status is ${sourceLabel(lead.status)}.`,
      label: "Updated",
      timestamp: lead.updated_at,
    });
  }

  if (lead.converted_at) {
    items.push({
      detail: "Converted into a contact record.",
      label: "Converted",
      timestamp: lead.converted_at,
    });
  }

  return items.sort(
    (left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}

export function LeadDetailClient({ leadId }: LeadDetailClientProps) {
  const queryClient = useQueryClient();
  const { canWriteActivities, canWriteLeads } = usePermissions();
  const [convertOpen, setConvertOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const leadQuery = useQuery({
    queryFn: () => api.get<Lead>(`/leads/${leadId}`),
    queryKey: ["leads", "detail", leadId],
  });
  const activitiesQuery = useQuery({
    queryFn: () =>
      api.get<ActivityRecord[]>("/activities/", {
        lead_id: leadId,
        page_size: 20,
      }),
    queryKey: ["leads", "activities", leadId],
  });
  const scoreMutation = useMutation({
    mutationFn: () => api.post<LeadScoreResponse>(`/leads/${leadId}/score`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({
        queryKey: ["leads", "detail", leadId],
      });
    },
  });

  const lead = leadQuery.data;
  const activityInitialLink = useMemo(
    () =>
      lead
        ? {
            id: lead.id,
            label: lead.full_name,
            type: "lead" as const,
          }
        : undefined,
    [lead?.full_name, lead?.id],
  );

  if (leadQuery.isLoading) {
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

  if (leadQuery.isError || !lead) {
    return (
      <div className="rounded-xl border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">
        Could not load lead.
      </div>
    );
  }

  const timelineItems: ActivityTimelineItem[] = (
    activitiesQuery.data ?? []
  ).map((activity) => ({
    date: activity.completed_at ?? activity.scheduled_at ?? activity.created_at,
    description: activity.body,
    id: activity.id,
    outcome: activity.outcome,
    subject: activity.subject,
    type: activity.type,
  }));
  const hasAttribution = Boolean(
    lead.campaign_id || lead.utm_source || lead.utm_campaign || lead.utm_medium,
  );

  return (
    <div className="grid gap-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-normal text-[var(--navy)]">
                {lead.full_name}
              </h1>
              <StatusPill status={lead.status} type="lead" />
            </div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {lead.company}
            </p>
            <LeadScoreBar className="mt-4 max-w-sm" score={lead.score} />
          </div>
          {canWriteLeads || canWriteActivities ? (
            <div className="flex flex-wrap gap-2">
              {canWriteLeads ? (
                <>
                  <Button onClick={() => setConvertOpen(true)} type="button">
                    <Repeat2 className="h-4 w-4" aria-hidden="true" />
                    {lead.status === "converted" ? "Contact" : "Convert"}
                  </Button>
                  <Button
                    onClick={() => setAssignOpen(true)}
                    type="button"
                    variant="outline"
                  >
                    <UserCheck className="h-4 w-4" aria-hidden="true" />
                    Assign
                  </Button>
                  <Button
                    disabled={scoreMutation.isPending}
                    onClick={() => scoreMutation.mutate()}
                    type="button"
                    variant="outline"
                  >
                    <RefreshCcw
                      className={cn(
                        "h-4 w-4",
                        scoreMutation.isPending && "animate-spin",
                      )}
                      aria-hidden="true"
                    />
                    Recalculate Score
                  </Button>
                  <Button
                    onClick={() => setEditOpen(true)}
                    type="button"
                    variant="outline"
                  >
                    <Edit className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </Button>
                </>
              ) : null}
              {canWriteActivities ? (
                <Button
                  onClick={() => setActivityOpen(true)}
                  type="button"
                  variant="ghost"
                >
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  Log Activity
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-[var(--muted-foreground)]">
              Read-only access
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--navy)]">
            Status History
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Created, updated, and conversion moments.
          </p>
          <div className="mt-5 space-y-4">
            {lifecycleItems(lead).map((item) => (
              <article
                className="flex gap-4 rounded-xl border border-slate-100 p-4"
                key={`${item.label}-${item.timestamp}`}
              >
                <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[var(--primary)]" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[var(--navy)]">
                      {item.label}
                    </h3>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(item.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{item.detail}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--navy)]">
                  Activities
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Calls, emails, meetings, and notes.
                </p>
              </div>
              {canWriteActivities ? (
                <Button
                  onClick={() => setActivityOpen(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Log Activity
                </Button>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {activitiesQuery.isLoading
                ? [1, 2, 3].map((item) => (
                    <Skeleton className="h-20 rounded-lg" key={item} />
                  ))
                : null}
              {!activitiesQuery.isLoading ? (
                <ActivityTimeline items={timelineItems} />
              ) : null}
            </div>
          </div>
        </section>

        <aside className="grid gap-4 content-start">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Lead Info
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[var(--muted-foreground)]">Email</dt>
                <dd className="mt-1 font-medium text-[var(--navy)]">
                  {lead.email}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Phone</dt>
                <dd className="mt-1 font-medium text-[var(--navy)]">
                  {lead.phone}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Source</dt>
                <dd className="mt-1 font-medium text-[var(--navy)]">
                  {sourceLabel(lead.source)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Assigned To</dt>
                <dd className="mt-1 font-medium text-[var(--navy)]">
                  {lead.assigned_to_name ?? "Unassigned"}
                </dd>
              </div>
              {hasAttribution ? (
                <>
                  {lead.campaign_id ? (
                    <div>
                      <dt className="text-[var(--muted-foreground)]">
                        Campaign ID
                      </dt>
                      <dd className="mt-1 break-all font-medium text-[var(--navy)]">
                        {lead.campaign_id}
                      </dd>
                    </div>
                  ) : null}
                  {lead.utm_source ? (
                    <div>
                      <dt className="text-[var(--muted-foreground)]">
                        UTM Source
                      </dt>
                      <dd className="mt-1 font-medium text-[var(--navy)]">
                        {lead.utm_source}
                      </dd>
                    </div>
                  ) : null}
                  {lead.utm_campaign ? (
                    <div>
                      <dt className="text-[var(--muted-foreground)]">
                        UTM Campaign
                      </dt>
                      <dd className="mt-1 font-medium text-[var(--navy)]">
                        {lead.utm_campaign}
                      </dd>
                    </div>
                  ) : null}
                  {lead.utm_medium ? (
                    <div>
                      <dt className="text-[var(--muted-foreground)]">
                        UTM Medium
                      </dt>
                      <dd className="mt-1 font-medium text-[var(--navy)]">
                        {lead.utm_medium}
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <dt className="text-[var(--muted-foreground)]">
                    Attribution
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--navy)]">
                    No attribution data
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {lead.status === "converted" ? (
            <section className="rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
              <h2 className="font-semibold">Converted Lead</h2>
              <p className="mt-2">
                This lead cannot be moved back to an earlier status.
              </p>
            </section>
          ) : null}
        </aside>
      </div>

      {canWriteLeads ? (
        <>
          <ConvertModal
            lead={lead}
            onOpenChange={setConvertOpen}
            open={convertOpen}
          />
          <AssignLeadDialog
            leadIds={[lead.id]}
            onAssigned={() => void leadQuery.refetch()}
            onOpenChange={setAssignOpen}
            open={assignOpen}
          />
          <LeadForm
            lead={lead}
            onOpenChange={setEditOpen}
            onSaved={() => void leadQuery.refetch()}
            open={editOpen}
          />
        </>
      ) : null}
      {canWriteActivities ? (
        <ActivityForm
          initialLink={activityInitialLink}
          onOpenChange={setActivityOpen}
          onSaved={() => void activitiesQuery.refetch()}
          open={activityOpen}
        />
      ) : null}
    </div>
  );
}
