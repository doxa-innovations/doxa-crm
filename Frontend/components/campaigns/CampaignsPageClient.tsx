"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MailCheck, MousePointerClick, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CampaignForm } from "@/components/campaigns/CampaignForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Campaign, CampaignMetrics, CampaignStatus, CampaignType } from "@/types/api";

const campaignTypes: CampaignType[] = ["email", "sms", "event", "social", "cold_call"];
const campaignStatuses: CampaignStatus[] = ["draft", "active", "paused", "completed"];

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function typePill(type: CampaignType) {
  return <span className="rounded-full bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#2563EB]">{optionLabel(type)}</span>;
}

function metricRate(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "0%";
}

function CampaignMetricSummary({ campaign }: { campaign: Campaign }) {
  const metricsQuery = useQuery({
    initialData: campaign.metrics,
    queryFn: () => api.get<CampaignMetrics>(`/campaigns/${campaign.id}/metrics`),
    queryKey: ["campaigns", "metrics", campaign.id],
    refetchInterval: campaign.status === "active" ? 10000 : false,
    refetchOnMount: "always",
  });
  const metrics = metricsQuery.data ?? campaign.metrics;

  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
        <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
          <MailCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Sent messages
        </div>
        <p className="mt-1 text-xl font-semibold text-[#0F2444]">{metrics.sent}</p>
      </div>
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
        <p className="text-xs text-[#64748B]">Opened</p>
        <p className="mt-1 text-xl font-semibold text-[#0F2444]">{metrics.opened}</p>
      </div>
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
        <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
          <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
          Clicked
        </div>
        <p className="mt-1 text-xl font-semibold text-[#0F2444]">{metrics.clicked}</p>
        <p className="mt-0.5 text-xs text-[#64748B]">{metricRate(metrics.clicked, metrics.sent)} rate</p>
      </div>
    </div>
  );
}

export function CampaignsPageClient() {
  const { canWriteCampaigns } = usePermissions();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const campaignsQuery = useQuery({
    queryFn: () =>
      api.get<Campaign[]>("/campaigns/", {
        page_size: 100,
        status: status || undefined,
        type: type || undefined,
      }),
    queryKey: ["campaigns", "list", status, type],
    refetchOnMount: "always",
  });
  const campaigns = campaignsQuery.data ?? [];
  const summary = useMemo(
    () =>
      campaigns.reduce(
        (totals, campaign) => ({
          active: totals.active + (campaign.status === "active" ? 1 : 0),
          budget: totals.budget + Number(campaign.budget ?? 0),
          enrolled: totals.enrolled + campaign.enrollment_count,
          total: totals.total + 1,
        }),
        { active: 0, budget: 0, enrolled: 0, total: 0 },
      ),
    [campaigns],
  );
  const filteredCampaigns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return campaigns;
    }

    return campaigns.filter((campaign) =>
      `${campaign.name} ${campaign.owner_name ?? ""} ${campaign.type} ${campaign.status}`.toLowerCase().includes(normalizedSearch),
    );
  }, [campaigns, search]);

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={canWriteCampaigns ? { icon: Plus, label: "New Campaign", onClick: () => setFormOpen(true) } : undefined}
        subtitle="Plan outreach, enroll contacts, and monitor campaign movement."
        title="Campaigns"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[#64748B]">Total campaigns</p>
          <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[#64748B]">Active</p>
          <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{summary.active}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[#64748B]">Enrolled contacts</p>
          <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{summary.enrolled}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[#64748B]">Budget total</p>
          <p className="mt-1 text-2xl font-semibold text-[#0F2444]">{formatCurrency(summary.budget)}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.4fr)_minmax(160px,0.8fr)_minmax(160px,0.8fr)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" aria-hidden="true" />
            <Input
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campaigns"
              value={search}
            />
          </div>
          <select className="h-10 rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="">All statuses</option>
            {campaignStatuses.map((item) => (
              <option key={item} value={item}>
                {optionLabel(item)}
              </option>
            ))}
          </select>
          <select className="h-10 rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950" onChange={(event) => setType(event.target.value)} value={type}>
            <option value="">All types</option>
            {campaignTypes.map((item) => (
              <option key={item} value={item}>
                {optionLabel(item)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {campaignsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Skeleton className="h-64 rounded-xl" key={item} />
          ))}
        </div>
      ) : null}

      {!campaignsQuery.isLoading && filteredCampaigns.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-[#64748B] shadow-sm">No campaigns found.</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCampaigns.map((campaign) => (
          <Link className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition hover:border-blue-100 hover:shadow-md" href={`/campaigns/${campaign.id}`} key={campaign.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-[#0F2444]">{campaign.name}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {typePill(campaign.type)}
                  <StatusPill status={campaign.status} type="campaign" />
                </div>
              </div>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-blue-100 bg-[#EFF6FF] text-[#2563EB]">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>

            <CampaignMetricSummary campaign={campaign} />

            <div className="mt-5 grid gap-2 text-sm text-[#64748B]">
              <p className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <Users className="h-4 w-4" aria-hidden="true" />
                {campaign.enrollment_count} enrolled contacts
              </p>
              <p>
                {formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}
              </p>
              <p>{formatCurrency(Number(campaign.budget ?? 0))} budget</p>
            </div>
          </Link>
        ))}
      </div>

      {campaignsQuery.isError ? <div className="rounded-xl border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">Could not load campaigns.</div> : null}
      {canWriteCampaigns ? <CampaignForm onOpenChange={setFormOpen} open={formOpen} /> : null}
    </div>
  );
}
