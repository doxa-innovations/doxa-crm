"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge, X } from "lucide-react";
import { useMemo, useState } from "react";

import { usePreference } from "@/hooks/usePreference";
import {
  useRecordOptions,
  RecordOptionsStatus,
} from "@/hooks/useRecordOptions";
import { LeadScoreBar } from "@/components/leads/LeadScoreBar";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { DuplicateLeadPair, Lead, LeadMergeRequest } from "@/types/api";

function LeadCard({ lead, title }: { lead?: Lead; title: string }) {
  if (!lead) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-[var(--navy)]">{title}</p>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          Lead not loaded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-[var(--muted-foreground)]">
        {title}
      </p>
      <h3 className="mt-2 font-semibold text-[var(--navy)]">
        {lead.full_name}
      </h3>
      <p className="mt-1 text-sm text-slate-700">{lead.company}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        {lead.email}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <StatusPill status={lead.status} type="lead" />
        <LeadScoreBar className="max-w-36" score={lead.score} />
      </div>
      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        Created {formatDate(lead.created_at)}
      </p>
    </div>
  );
}

interface DuplicatesViewProps {
  canWriteLeads?: boolean;
}

export function DuplicatesView({ canWriteLeads = true }: DuplicatesViewProps) {
  const queryClient = useQueryClient();
  const ignored = usePreference<string[]>("duplicate-dismissals", []);
  const dismissed = new Set(ignored.value);
  const duplicatesQuery = useRecordOptions<DuplicateLeadPair>(
    "/leads/duplicates",
    {},
    ["leads", "duplicates"],
  );
  const leadsQuery = useQuery({
    queryKey: ["leads", "duplicate-details", duplicatesQuery.data],
    enabled: !!duplicatesQuery.data,
    queryFn: () =>
      Promise.all(
        Array.from(
          new Set(
            (duplicatesQuery.data ?? []).flatMap((p) => [
              p.lead_id,
              p.duplicate_lead_id,
            ]),
          ),
        ).map((id) => api.get<Lead>(`/leads/${id}`)),
      ),
  });
  const mergeMutation = useMutation({
    mutationFn: (payload: LeadMergeRequest) =>
      api.post<Lead, LeadMergeRequest>("/leads/merge", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const leadMap = useMemo(() => {
    return new Map((leadsQuery.data ?? []).map((lead) => [lead.id, lead]));
  }, [leadsQuery.data]);
  const pairs = (duplicatesQuery.data ?? []).filter(
    (pair) => !dismissed.has(`${pair.lead_id}:${pair.duplicate_lead_id}`),
  );

  if (duplicatesQuery.isLoading || leadsQuery.isLoading) {
    return (
      <div className="grid gap-4">
        {[1, 2, 3].map((item) => (
          <Skeleton className="h-56 rounded-xl" key={item} />
        ))}
      </div>
    );
  }

  if (duplicatesQuery.isError) {
    return (
      <div className="rounded-xl border border-red-100 bg-white p-5 text-sm text-red-700 shadow-sm">
        Could not load duplicate leads.
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center text-sm text-[var(--muted-foreground)] shadow-sm">
        No visible duplicate matches.
        <RecordOptionsStatus query={duplicatesQuery} label="duplicate pairs" />
        <Button variant="outline" onClick={() => ignored.save([])}>
          Reset dismissed matches
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {pairs.map((pair) => {
        const key = `${pair.lead_id}:${pair.duplicate_lead_id}`;
        const primary = leadMap.get(pair.lead_id);
        const duplicate = leadMap.get(pair.duplicate_lead_id);

        return (
          <section className="rounded-xl bg-white p-5 shadow-sm" key={key}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--navy)]">
                  {Math.round(pair.similarity_score * 100)}% match
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {pair.reason}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canWriteLeads ? (
                  <Button
                    disabled={mergeMutation.isPending || !primary || !duplicate}
                    onClick={() =>
                      window.confirm(
                        "Keep the primary lead values, preserve the highest score and move activities, tasks and conversion links? The duplicate will be archived.",
                      ) &&
                      mergeMutation.mutate({
                        duplicate_lead_id: pair.duplicate_lead_id,
                        primary_lead_id: pair.lead_id,
                      })
                    }
                    size="sm"
                    type="button"
                  >
                    <GitMerge className="h-4 w-4" aria-hidden="true" />
                    Keep Primary
                  </Button>
                ) : null}
                <Button
                  onClick={() => ignored.save([...ignored.value, key])}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Not Duplicate
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <LeadCard lead={primary} title="Primary" />
              <LeadCard lead={duplicate} title="Duplicate" />
            </div>
          </section>
        );
      })}
      <RecordOptionsStatus query={duplicatesQuery} label="duplicate pairs" />
      <Button variant="outline" onClick={() => ignored.save([])}>
        Reset dismissed matches
      </Button>
    </div>
  );
}
