"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, ChevronDown, ChevronRight, Edit, FolderKanban, Mail, Phone, Plus, Trash2, Trophy, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActivityForm } from "@/components/activities/ActivityForm";
import { AddCollaboratorDialog } from "@/components/deals/AddCollaboratorDialog";
import { DealForm } from "@/components/deals/DealForm";
import { LostReasonModal } from "@/components/deals/LostReasonModal";
import { ActivityTimeline, type ActivityTimelineItem } from "@/components/shared/ActivityTimeline";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatDate, getInitials } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import type { Deal, DealDetailResponse, DealLostRequest, Pipeline, Project } from "@/types/api";

interface DealDetailClientProps {
  dealId: string;
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function formatType(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function activityIcon(type: string) {
  if (type === "call") {
    return Phone;
  }

  if (type === "email") {
    return Mail;
  }

  return Activity;
}

function stageLabel(stageId: string): string {
  return stageId ? "Stage change" : "Unknown stage";
}

export function DealDetailClient({ dealId }: DealDetailClientProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { canWriteActivities, canWriteDeals, canWriteProjects } = usePermissions();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [collaboratorOpen, setCollaboratorOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dealQuery = useQuery({
    queryFn: () => api.get<DealDetailResponse>(`/deals/${dealId}`),
    queryKey: ["deals", "detail", dealId],
  });
  const pipelinesQuery = useQuery({
    queryFn: () => api.get<Pipeline[]>("/pipelines/"),
    queryKey: ["pipelines", "deal-detail"],
  });

  const markWon = useMutation({
    mutationFn: () => api.post<Deal>(`/deals/${dealId}/won`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", dealId] });
    },
  });
  const markLost = useMutation({
    mutationFn: (lostReason: string) =>
      api.post<Deal, DealLostRequest>(`/deals/${dealId}/lost`, {
        lost_reason: lostReason,
      }),
    onSuccess: () => {
      setLostOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", dealId] });
    },
  });
  const createProject = useMutation({
    mutationFn: () => api.post<Project>(`/projects/from-deal/${dealId}`),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/projects/${project.id}`);
    },
  });
  const deleteDeal = useMutation({
    mutationFn: () => api.delete<void>(`/deals/${dealId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/deals");
    },
    meta: {
      successMessage: "Deal deleted",
    },
  });

  const deal = dealQuery.data;
  const pipeline = (pipelinesQuery.data ?? []).find((item) => item.id === deal?.pipeline_id);
  const stages = pipeline?.stages ?? [];
  const currentStageIndex = stages.findIndex((stage) => stage.id === deal?.stage_id);
  const stageNameById = useMemo(() => new Map(stages.map((stage) => [stage.id, stage.name])), [stages]);

  if (dealQuery.isLoading) {
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

  if (dealQuery.isError || !deal) {
    return <div className="rounded-xl border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">Could not load deal.</div>;
  }

  const timelineItems: ActivityTimelineItem[] = [
    ...deal.activities.map((activity) => ({
      date: activity.completed_at ?? activity.scheduled_at ?? activity.created_at,
      description: activity.body,
      id: activity.id,
      outcome: activity.outcome,
      subject: activity.subject,
      type: activity.type,
    })),
    ...deal.tasks.map((task) => ({
      date: task.completed_at ?? task.due_at ?? task.created_at,
      description: task.description,
      id: task.id,
      outcome: task.status,
      subject: task.title,
      type: "task" as const,
    })),
  ];

  return (
    <div className="grid gap-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-normal text-[#0F2444]">{deal.title}</h1>
              <StatusPill status={deal.status} type="deal" />
            </div>
            <p className="mt-1 text-sm text-[#64748B]">
              {deal.account_name ?? "Linked account"} - {deal.contact_name ?? "Primary contact"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWriteProjects ? (
              <Button
                disabled={deal.status !== "won" || createProject.isPending}
                onClick={() => createProject.mutate()}
                title={deal.status !== "won" ? "Only closed-won deals can become projects." : undefined}
                type="button"
                variant="outline"
              >
                <FolderKanban className="h-4 w-4" aria-hidden="true" />
                Create Project
              </Button>
            ) : null}
            {canWriteDeals ? (
              <>
                <Button disabled={deal.status === "won" || markWon.isPending} onClick={() => markWon.mutate()} type="button">
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  Mark Won
                </Button>
                <Button disabled={deal.status === "lost"} onClick={() => setLostOpen(true)} type="button" variant="destructive">
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Mark Lost
                </Button>
                <Button onClick={() => setEditOpen(true)} type="button" variant="outline">
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Edit Deal
                </Button>
                <Button disabled={deleteDeal.isPending} onClick={() => setDeleteOpen(true)} type="button" variant="destructive">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete Deal
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
            <span>{pipeline?.name ?? "Pipeline"}</span>
            <span>{deal.stage_name ?? stageNameById.get(deal.stage_id) ?? "Current stage"}</span>
          </div>
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(0, 1fr))` }}>
            {stages.length > 0
              ? stages.map((stage, index) => {
                  const reached = currentStageIndex >= index;
                  return (
                    <div key={stage.id}>
                      <div className={cn("h-2 rounded-full", reached ? "bg-[#2563EB]" : "bg-slate-200")} />
                      <p className="mt-2 truncate text-xs text-[#64748B]">{stage.name}</p>
                    </div>
                  );
                })
              : <div className="h-2 rounded-full bg-slate-200" />}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#0F2444]">Activity Timeline</h2>
              <p className="mt-1 text-sm text-[#64748B]">Recent touchpoints, follow-ups, and deal work.</p>
            </div>
            {canWriteActivities ? (
              <Button onClick={() => setActivityOpen(true)} type="button" variant="outline">
                <Activity className="h-4 w-4" aria-hidden="true" />
                Log Activity
              </Button>
            ) : null}
          </div>
          <div className="mt-5 space-y-4">
            <ActivityTimeline items={timelineItems} />
          </div>
        </section>

        <aside className="grid gap-4 content-start">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Deal Details</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[#64748B]">Value</dt>
                <dd className="mt-1 font-semibold text-[#0F2444]">{formatCurrency(toNumber(deal.value), deal.currency)}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Probability</dt>
                <dd className="mt-1 font-semibold text-[#0F2444]">{Math.round(deal.probability)}%</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Expected Close</dt>
                <dd className="mt-1 font-semibold text-[#0F2444]">{formatDate(deal.expected_close)}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Type</dt>
                <dd className="mt-1 font-semibold text-[#0F2444]">{formatType(deal.type)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Account</h2>
            <Link className="mt-3 block font-semibold text-[#2563EB] hover:underline" href={`/accounts/${deal.account_id}`}>
              {deal.account_name ?? "Linked account"}
            </Link>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Contact</h2>
            <Link className="mt-3 block font-semibold text-[#2563EB] hover:underline" href={`/contacts/${deal.contact_id}`}>
              {deal.contact_name ?? "Primary contact"}
            </Link>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-[#0F2444]">Collaborators</h2>
              {canWriteDeals ? (
                <Button onClick={() => setCollaboratorOpen(true)} size="sm" type="button" variant="outline">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </Button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              {deal.collaborators.length === 0 ? <p className="text-sm text-[#64748B]">No collaborators yet.</p> : null}
              {deal.collaborators.map((collaborator) => (
                <div className="flex items-center gap-3" key={collaborator.user_id}>
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-[#0F2444] text-xs font-semibold text-white">
                    {getInitials(collaborator.user_name ?? collaborator.role)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0F2444]">{collaborator.user_name ?? "Team member"}</p>
                    <p className="text-xs text-[#64748B]">{collaborator.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setHistoryOpen((open) => !open)} type="button">
              <span className="text-base font-semibold text-[#0F2444]">Stage History</span>
              {historyOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            </button>
            {historyOpen ? (
              <div className="mt-4 grid gap-3">
                {deal.stage_history.length === 0 ? <p className="text-sm text-[#64748B]">No stage changes yet.</p> : null}
                {deal.stage_history.map((history) => (
                  <div className="rounded-lg border border-slate-100 p-3 text-sm" key={history.id}>
                    <div className="flex items-center gap-2 text-[#0F2444]">
                      <CheckCircle2 className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                      <span>{stageNameById.get(history.to_stage_id) ?? stageLabel(history.to_stage_id)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#64748B]">{formatDate(history.created_at)}</p>
                    {history.note ? <p className="mt-2 text-xs text-slate-700">{history.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {canWriteDeals ? <LostReasonModal isPending={markLost.isPending} onCancel={() => setLostOpen(false)} onConfirm={(reason) => markLost.mutate(reason)} open={lostOpen} /> : null}
      {canWriteDeals ? (
        <ConfirmDialog
          confirmLabel="Delete Deal"
          description="This will hide the deal from active views and search. The database record is kept for history."
          isPending={deleteDeal.isPending}
          onConfirm={() => deleteDeal.mutate()}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          title="Delete this deal?"
        />
      ) : null}
      {canWriteActivities ? (
        <ActivityForm
          initialLink={{ id: deal.id, label: deal.title, type: "deal" }}
          onOpenChange={setActivityOpen}
          onSaved={() => void dealQuery.refetch()}
          open={activityOpen}
        />
      ) : null}
      {canWriteDeals ? (
        <>
          <DealForm deal={deal} onOpenChange={setEditOpen} onSaved={() => void dealQuery.refetch()} open={editOpen} selectedPipelineId={deal.pipeline_id} />
          <AddCollaboratorDialog dealId={deal.id} onOpenChange={setCollaboratorOpen} open={collaboratorOpen} />
        </>
      ) : null}
    </div>
  );
}
