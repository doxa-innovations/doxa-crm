"use client";

import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  GripVertical,
  ListChecks,
  Mail,
  MailCheck,
  MessageCircle,
  MousePointerClick,
  Pause,
  PhoneCall,
  Play,
  Plus,
  Reply,
  RotateCcw,
  Share2,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CampaignForm } from "@/components/campaigns/CampaignForm";
import { ContactSelectModal } from "@/components/campaigns/ContactSelectModal";
import { SequenceStepForm } from "@/components/campaigns/SequenceStepForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type {
  Campaign,
  CampaignEnrollment,
  CampaignMetric,
  CampaignMetricCreate,
  CampaignMetricEventType,
  CampaignMetrics,
  CampaignSequenceChannel,
  CampaignSequenceStep,
  CampaignStepsReorderRequest,
  CampaignUpdate,
} from "@/types/api";

type CampaignTab = "overview" | "sequence" | "enrollments" | "metrics";

interface CampaignDetailClientProps {
  campaignId: string;
}

const metricEvents: Array<{ eventType: CampaignMetricEventType; label: string }> = [
  { eventType: "sent", label: "Sent" },
  { eventType: "opened", label: "Opened" },
  { eventType: "clicked", label: "Clicked" },
  { eventType: "replied", label: "Replied" },
  { eventType: "converted", label: "Converted" },
];

const channelMeta: Record<
  CampaignSequenceChannel,
  {
    className: string;
    icon: LucideIcon;
    label: string;
  }
> = {
  call: {
    className: "bg-violet-50 text-violet-700",
    icon: PhoneCall,
    label: "Call",
  },
  email: {
    className: "bg-blue-50 text-blue-700",
    icon: Mail,
    label: "Email",
  },
  sms: {
    className: "bg-emerald-50 text-emerald-700",
    icon: MessageCircle,
    label: "SMS",
  },
  social: {
    className: "bg-amber-50 text-amber-700",
    icon: Share2,
    label: "Social",
  },
  task: {
    className: "bg-slate-100 text-slate-700",
    icon: ListChecks,
    label: "Task",
  },
};

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function preview(body?: string | null): string {
  if (!body) {
    return "No body yet.";
  }

  return body.length > 140 ? `${body.slice(0, 140)}...` : body;
}

function metricChartData(metrics?: CampaignMetrics) {
  const current = metrics ?? { clicked: 0, converted: 0, opened: 0, replied: 0, sent: 0 };
  return [
    { clicked: 0, label: "Start", opened: 0, sent: 0 },
    { clicked: current.clicked, label: "Current", opened: current.opened, sent: current.sent },
  ];
}

function variantRows(steps: CampaignSequenceStep[]) {
  const variants = new Map<string, { count: number; subjects: string[] }>();
  steps.forEach((step) => {
    if (!step.variant) {
      return;
    }
    const row = variants.get(step.variant) ?? { count: 0, subjects: [] };
    row.count += 1;
    row.subjects.push(step.subject);
    variants.set(step.variant, row);
  });
  return Array.from(variants.entries()).map(([variant, data]) => ({ variant, ...data }));
}

export function CampaignDetailClient({ campaignId }: CampaignDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canWriteCampaigns } = usePermissions();
  const [tab, setTab] = useState<CampaignTab>("overview");
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const [stepFormOpen, setStepFormOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<CampaignSequenceStep | null>(null);
  const [contactSelectOpen, setContactSelectOpen] = useState(false);
  const [deleteCampaignOpen, setDeleteCampaignOpen] = useState(false);
  const [restartCampaignOpen, setRestartCampaignOpen] = useState(false);
  const [metricContactId, setMetricContactId] = useState("");
  const [metricStepId, setMetricStepId] = useState("");

  const campaignQuery = useQuery({
    queryFn: () => api.get<Campaign>(`/campaigns/${campaignId}`),
    queryKey: ["campaigns", "detail", campaignId],
    refetchOnMount: "always",
  });
  const campaign = campaignQuery.data;
  const stepsQuery = useQuery({
    queryFn: () => api.get<CampaignSequenceStep[]>(`/campaigns/${campaignId}/steps`),
    queryKey: ["campaigns", "steps", campaignId],
  });
  const enrollmentsQuery = useQuery({
    queryFn: () => api.get<CampaignEnrollment[]>(`/campaigns/${campaignId}/enrollments`, { page_size: 100 }),
    queryKey: ["campaigns", "enrollments", campaignId],
  });
  const metricsQuery = useQuery({
    queryFn: () => api.get<CampaignMetrics>(`/campaigns/${campaignId}/metrics`),
    queryKey: ["campaigns", "metrics", campaignId],
    refetchInterval: campaign?.status === "active" ? 10000 : false,
    refetchOnMount: "always",
  });

  const activateCampaign = useMutation({
    mutationFn: () => api.post<Campaign>(`/campaigns/${campaignId}/activate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "metrics", campaignId] });
    },
  });
  const pauseCampaign = useMutation({
    mutationFn: () => api.post<Campaign>(`/campaigns/${campaignId}/pause`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "metrics", campaignId] });
    },
  });
  const restartCampaign = useMutation({
    mutationFn: () => api.post<Campaign>(`/campaigns/${campaignId}/restart`),
    onSuccess: () => {
      setRestartCampaignOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "enrollments", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "metrics", campaignId] });
    },
  });
  const completeCampaign = useMutation({
    mutationFn: () => api.patch<Campaign, CampaignUpdate>(`/campaigns/${campaignId}`, { status: "completed" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "metrics", campaignId] });
    },
  });
  const deleteCampaign = useMutation({
    mutationFn: () => api.delete<void>(`/campaigns/${campaignId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.push("/campaigns");
    },
  });
  const reorderSteps = useMutation({
    mutationFn: (stepIds: string[]) =>
      api.post<CampaignSequenceStep[], CampaignStepsReorderRequest>(`/campaigns/${campaignId}/steps/reorder`, {
        step_ids: stepIds,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "steps", campaignId] });
    },
  });
  const deleteStep = useMutation({
    mutationFn: (stepId: string) => api.delete<void>(`/campaigns/${campaignId}/steps/${stepId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "steps", campaignId] });
    },
  });
  const unenrollContact = useMutation({
    mutationFn: (contactId: string) => api.delete<CampaignEnrollment>(`/campaigns/${campaignId}/enrollments/${contactId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "enrollments", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "metrics", campaignId] });
    },
  });

  const steps = stepsQuery.data ?? [];
  const enrollments = enrollmentsQuery.data ?? [];
  const metrics = metricsQuery.data ?? campaign?.metrics;
  const hasMetrics = Boolean(metrics && Object.values(metrics).some((value) => value > 0));
  const hasSteps = steps.length > 0;
  const hasActiveEnrollments = enrollments.some((enrollment) => enrollment.status === "active");
  const hasRestartableEnrollments = enrollments.some((enrollment) => enrollment.status !== "unsubscribed");
  const canActivate = hasSteps && hasActiveEnrollments && campaign?.status !== "active" && campaign?.status !== "completed";
  const canRestart = Boolean(campaign && campaign.status !== "draft" && hasSteps && hasRestartableEnrollments);
  const disabledActivationReason = !hasSteps ? "Add at least one sequence step before activating." : !hasActiveEnrollments ? "Enroll active contacts before activating." : "";
  const disabledRestartReason = !hasSteps ? "Add at least one sequence step before restarting." : !hasRestartableEnrollments ? "Enroll contacts before restarting." : "";
  const sortedSteps = [...steps].sort((left, right) => left.step_index - right.step_index);
  const variantComparison = useMemo(() => variantRows(steps), [steps]);
  const metricContactOptions = enrollments.filter((enrollment) => enrollment.status !== "unsubscribed");
  const metricContactIds = new Set(metricContactOptions.map((enrollment) => enrollment.contact_id));
  const activeMetricContactId = metricContactIds.has(metricContactId) ? metricContactId : metricContactOptions[0]?.contact_id ?? "";
  const metricStepIds = new Set(sortedSteps.map((step) => step.id));
  const activeMetricStepId = metricStepIds.has(metricStepId) ? metricStepId : "";
  const recordMetric = useMutation({
    mutationFn: (eventType: CampaignMetricEventType) =>
      api.post<CampaignMetric, CampaignMetricCreate>(`/campaigns/${campaignId}/metrics`, {
        contact_id: activeMetricContactId,
        event_type: eventType,
        step_id: activeMetricStepId || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns", "metrics", campaignId] });
    },
  });

  function onDragEnd(result: DropResult) {
    if (!canWriteCampaigns) {
      return;
    }

    if (!result.destination || result.destination.index === result.source.index) {
      return;
    }

    const nextSteps = [...sortedSteps];
    const [moved] = nextSteps.splice(result.source.index, 1);
    if (!moved) {
      return;
    }
    nextSteps.splice(result.destination.index, 0, moved);
    reorderSteps.mutate(nextSteps.map((step) => step.id));
  }

  if (campaignQuery.isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (campaignQuery.isError || !campaign) {
    return <div className="rounded-xl border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">Could not load campaign.</div>;
  }

  const tabs: Array<{ label: string; value: CampaignTab }> = [
    { label: "Overview", value: "overview" },
    { label: "Sequence", value: "sequence" },
    { label: "Enrollments", value: "enrollments" },
    { label: "Metrics", value: "metrics" },
  ];

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-normal text-[#0F2444]">{campaign.name}</h1>
              <StatusPill status={campaign.status} type="campaign" />
              <span className="rounded-full bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#2563EB]">{optionLabel(campaign.type)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#64748B]">
              <span>{formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}</span>
              <span>{campaign.owner_name ?? "Unassigned owner"}</span>
              <span>{campaign.enrollment_count} enrolled</span>
            </div>
          </div>
          {canWriteCampaigns ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setCampaignFormOpen(true)} type="button" variant="outline">
                Edit Campaign
              </Button>
              {campaign.status === "draft" ? (
                <Button
                  className="border-red-100 text-red-700 hover:bg-red-50 hover:text-red-800"
                  onClick={() => setDeleteCampaignOpen(true)}
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-100 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {tabs.map((item) => (
            <button
              className={cn("rounded-md px-4 py-2 text-sm font-semibold transition-colors", tab === item.value ? "bg-slate-100 text-[#0F2444]" : "text-[#64748B] hover:bg-slate-50 hover:text-[#0F2444]")}
              key={item.value}
              onClick={() => setTab(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {tab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Campaign Info</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[#64748B]">Type</dt>
                <dd className="font-semibold text-[#0F2444]">{optionLabel(campaign.type)}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Status</dt>
                <dd className="mt-1"><StatusPill status={campaign.status} type="campaign" /></dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Dates</dt>
                <dd className="font-semibold text-[#0F2444]">{formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}</dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Budget</dt>
                <dd className="font-semibold text-[#0F2444]">{formatCurrency(Number(campaign.budget ?? 0))}</dd>
              </div>
            </dl>
            {canWriteCampaigns ? (
              <div className="mt-5">
                {campaign.status === "completed" ? (
                  <p className="text-sm font-medium text-[#64748B]">This campaign is completed. Restart it to send the sequence from step 1 again.</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {campaign.status !== "completed" ? (
                    <>
                    {campaign.status === "active" ? (
                      <Button disabled={pauseCampaign.isPending} onClick={() => pauseCampaign.mutate()} type="button" variant="outline">
                        <Pause className="h-4 w-4" aria-hidden="true" />
                        Pause
                      </Button>
                    ) : (
                      <div className="inline-flex" title={!canActivate ? disabledActivationReason : undefined}>
                        <Button disabled={!canActivate || activateCampaign.isPending} onClick={() => activateCampaign.mutate()} type="button">
                          <Play className="h-4 w-4" aria-hidden="true" />
                          {campaign.status === "paused" ? "Resume" : "Activate"}
                        </Button>
                      </div>
                    )}
                    </>
                  ) : null}
                  {(campaign.status === "active" || campaign.status === "paused") ? (
                    <Button disabled={completeCampaign.isPending} onClick={() => completeCampaign.mutate()} type="button" variant="outline">
                      <CheckCircle className="h-4 w-4" aria-hidden="true" />
                      Mark Complete
                    </Button>
                  ) : null}
                  {campaign.status !== "draft" ? (
                    <div className="inline-flex" title={!canRestart ? disabledRestartReason : undefined}>
                      <Button disabled={!canRestart || restartCampaign.isPending} onClick={() => setRestartCampaignOpen(true)} type="button" variant="outline">
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Restart
                      </Button>
                    </div>
                  ) : null}
                </div>
                {!canActivate && campaign.status !== "active" && campaign.status !== "completed" ? <p className="mt-2 text-xs text-amber-700">{disabledActivationReason}</p> : null}
                {!canRestart && campaign.status !== "draft" ? <p className="mt-2 text-xs text-amber-700">{disabledRestartReason}</p> : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-[#0F2444]">Campaign Metrics</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#64748B]">
                  <MailCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Sent messages
                </div>
                <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{metrics?.sent ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium text-[#64748B]">Opened</p>
                <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{metrics?.opened ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#64748B]">
                  <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
                  Clicked
                </div>
                <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{metrics?.clicked ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#64748B]">
                  <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                  Replied
                </div>
                <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{metrics?.replied ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#64748B]">
                  <Target className="h-3.5 w-3.5" aria-hidden="true" />
                  Converted
                </div>
                <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{metrics?.converted ?? 0}</p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "sequence" ? (
        <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#0F2444]">Campaign Sequence</h2>
              <p className="mt-1 text-sm text-[#64748B]">Drag steps to reorder. Reorder saves on drop.</p>
            </div>
            {canWriteCampaigns ? (
              <Button onClick={() => { setEditingStep(null); setStepFormOpen(true); }} type="button">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Step
              </Button>
            ) : null}
          </div>
          <div className="mt-5">
            {stepsQuery.isLoading ? <Skeleton className="h-72 rounded-xl" /> : null}
            {!stepsQuery.isLoading && sortedSteps.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-[#64748B]">No sequence steps yet.</div> : null}
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="campaign-steps" isDropDisabled={!canWriteCampaigns}>
                {(provided) => (
                  <div className="grid gap-3" ref={provided.innerRef} {...provided.droppableProps}>
                    {sortedSteps.map((step, index) => {
                      const meta = channelMeta[step.channel] ?? channelMeta.email;
                      const ChannelIcon = meta.icon;

                      return (
                      <Draggable draggableId={step.id} index={index} isDragDisabled={!canWriteCampaigns} key={step.id}>
                        {(draggableProvided) => {
                          const { style, ...draggableProps } = draggableProvided.draggableProps;

                          return (
                            <article
                              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                              ref={draggableProvided.innerRef}
                              style={style as CSSProperties | undefined}
                              {...draggableProps}
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex min-w-0 gap-3">
                                  <button className="mt-1 text-[#64748B]" disabled={!canWriteCampaigns} type="button" {...draggableProvided.dragHandleProps}>
                                    <GripVertical className="h-5 w-5" aria-hidden="true" />
                                  </button>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-[#0F2444]">Step {index + 1}</span>
                                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", meta.className)}>
                                        <ChannelIcon className="h-3 w-3" aria-hidden="true" />
                                        {meta.label}
                                      </span>
                                      <span className="text-xs font-medium text-[#64748B]">Delay: {step.delay_days} days after previous</span>
                                      {step.variant ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Variant {step.variant}</span> : null}
                                    </div>
                                    <h3 className="mt-3 font-semibold text-[#0F2444]">{step.subject}</h3>
                                    <p className="mt-1 text-sm text-slate-700">{preview(step.body)}</p>
                                  </div>
                                </div>
                                {canWriteCampaigns ? (
                                  <div className="flex gap-2">
                                    <Button onClick={() => { setEditingStep(step); setStepFormOpen(true); }} size="sm" type="button" variant="outline">Edit</Button>
                                    <Button disabled={deleteStep.isPending} onClick={() => deleteStep.mutate(step.id)} size="sm" type="button" variant="ghost">
                                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            </article>
                          );
                        }}
                      </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </section>
      ) : null}

      {tab === "enrollments" ? (
        <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#0F2444]">Enrollments</h2>
              <p className="mt-1 text-sm text-[#64748B]">Contacts currently enrolled in this campaign.</p>
            </div>
            {canWriteCampaigns ? (
              <Button onClick={() => setContactSelectOpen(true)} type="button">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Enroll Contacts
              </Button>
            ) : null}
          </div>
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            {enrollments.length === 0 ? <div className="p-8 text-center text-sm text-[#64748B]">No enrolled contacts yet.</div> : null}
            {enrollments.map((enrollment) => (
              <div className="grid gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_120px_140px_120px_auto] md:items-center" key={enrollment.id}>
                <div>
                  <Link className="font-semibold text-[#0F2444] hover:text-[#2563EB]" href={`/contacts/${enrollment.contact_id}`}>{enrollment.contact_name ?? "Contact"}</Link>
                  <p className="mt-1 text-xs text-[#64748B]">{enrollment.contact_email}</p>
                </div>
                <span className="text-sm text-[#64748B]">Step {enrollment.step_index + 1}</span>
                <StatusPill status={enrollment.status} type="campaign" />
                <span className="text-sm text-[#64748B]">{formatDate(enrollment.enrolled_at)}</span>
                {canWriteCampaigns && enrollment.status !== "unsubscribed" ? (
                  <Button disabled={unenrollContact.isPending} onClick={() => unenrollContact.mutate(enrollment.contact_id)} size="sm" type="button" variant="outline">
                    Unenroll
                  </Button>
                ) : canWriteCampaigns ? (
                  <span className="text-sm font-medium text-[#64748B]">Removed</span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "metrics" ? (
        <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[#0F2444]">Delivery Metrics</h2>
          {canWriteCampaigns ? (
            <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto] lg:items-end">
              <div>
                <label className="text-xs font-semibold uppercase tracking-normal text-[#64748B]" htmlFor="metric_contact">
                  Contact
                </label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  disabled={metricContactOptions.length === 0 || recordMetric.isPending}
                  id="metric_contact"
                  onChange={(event) => setMetricContactId(event.target.value)}
                  value={activeMetricContactId}
                >
                  {metricContactOptions.length === 0 ? <option value="">No enrolled contacts</option> : null}
                  {metricContactOptions.map((enrollment) => (
                    <option key={enrollment.id} value={enrollment.contact_id}>
                      {enrollment.contact_name ?? enrollment.contact_email ?? "Contact"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-normal text-[#64748B]" htmlFor="metric_step">
                  Step
                </label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  disabled={recordMetric.isPending}
                  id="metric_step"
                  onChange={(event) => setMetricStepId(event.target.value)}
                  value={activeMetricStepId}
                >
                  <option value="">Campaign level</option>
                  {sortedSteps.map((step, index) => (
                    <option key={step.id} value={step.id}>
                      Step {index + 1}: {step.subject}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {metricEvents.map((event) => (
                  <Button
                    disabled={!activeMetricContactId || recordMetric.isPending}
                    key={event.eventType}
                    onClick={() => recordMetric.mutate(event.eventType)}
                    size="sm"
                    type="button"
                    variant={event.eventType === "sent" ? "outline" : "default"}
                  >
                    {event.label}
                  </Button>
                ))}
              </div>
              {recordMetric.isError ? <div className="text-sm text-red-700 lg:col-span-3">Could not record metric.</div> : null}
            </div>
          ) : null}
          {!hasMetrics ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-[#64748B]">No data yet</div>
          ) : (
            <>
              <div className="mt-5 h-72">
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart data={metricChartData(metrics)}>
                    <CartesianGrid stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line dataKey="sent" stroke="#2563EB" strokeWidth={2} />
                    <Line dataKey="opened" stroke="#10B981" strokeWidth={2} />
                    <Line dataKey="clicked" stroke="#F59E0B" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-[#64748B]">Open Rate</p><p className="text-xl font-semibold text-[#0F2444]">{rate(metrics?.opened ?? 0, metrics?.sent ?? 0)}%</p></div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-[#64748B]">Click Rate</p><p className="text-xl font-semibold text-[#0F2444]">{rate(metrics?.clicked ?? 0, metrics?.sent ?? 0)}%</p></div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-[#64748B]">Reply Rate</p><p className="text-xl font-semibold text-[#0F2444]">{rate(metrics?.replied ?? 0, metrics?.sent ?? 0)}%</p></div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-[#64748B]">Conversion Rate</p><p className="text-xl font-semibold text-[#0F2444]">{rate(metrics?.converted ?? 0, metrics?.sent ?? 0)}%</p></div>
              </div>
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-[#0F2444]">A/B Variant Comparison</h3>
                {variantComparison.length === 0 ? <p className="mt-2 text-sm text-[#64748B]">No variants configured.</p> : null}
                {variantComparison.length > 0 ? (
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                    {variantComparison.map((row) => (
                      <div className="grid gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 md:grid-cols-[120px_120px_minmax(0,1fr)]" key={row.variant}>
                        <span className="font-semibold text-[#0F2444]">Variant {row.variant}</span>
                        <span className="text-sm text-[#64748B]">{row.count} steps</span>
                        <span className="truncate text-sm text-slate-700">{row.subjects.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      ) : null}

      {canWriteCampaigns ? (
        <>
          <CampaignForm campaign={campaign} onOpenChange={setCampaignFormOpen} onSaved={() => void campaignQuery.refetch()} open={campaignFormOpen} />
          <SequenceStepForm
            campaignId={campaign.id}
            onOpenChange={(open) => {
              setStepFormOpen(open);
              if (!open) setEditingStep(null);
            }}
            open={stepFormOpen}
            previousStepNumber={editingStep ? Math.max(1, editingStep.step_index) : sortedSteps.length}
            step={editingStep}
          />
          <ContactSelectModal campaignId={campaign.id} onOpenChange={setContactSelectOpen} open={contactSelectOpen} />
          <ConfirmDialog
            confirmLabel="Delete"
            description="Delete this draft campaign and its sequence steps. This cannot be undone."
            isPending={deleteCampaign.isPending}
            onConfirm={() => deleteCampaign.mutate()}
            onOpenChange={setDeleteCampaignOpen}
            open={deleteCampaignOpen}
            title="Delete campaign"
          />
          <ConfirmDialog
            confirmLabel="Restart"
            description="Restart this campaign from step 1 for every enrolled contact that has not been removed. Existing metrics will reset, and messages can be sent again."
            isPending={restartCampaign.isPending}
            onConfirm={() => restartCampaign.mutate()}
            onOpenChange={setRestartCampaignOpen}
            open={restartCampaignOpen}
            title="Restart campaign"
          />
        </>
      ) : null}
    </div>
  );
}
