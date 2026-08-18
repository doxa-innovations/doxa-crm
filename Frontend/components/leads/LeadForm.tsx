"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import type { Campaign, Lead, LeadCreate, LeadSource, LeadStatus, LeadUpdate, User } from "@/types/api";

const leadSources: LeadSource[] = ["website", "referral", "social", "cold_outreach", "event", "campaign"];
const leadStatuses: LeadStatus[] = ["new", "contacted", "qualified", "disqualified"];
const allLeadStatuses: LeadStatus[] = [...leadStatuses, "converted"];

const leadFormSchema = z.object({
  assigned_to: z.string().optional(),
  campaign_id: z.string().optional(),
  company: z.string().min(1, "Company is required."),
  email: z.string().email("Enter a valid email address."),
  full_name: z.string().min(1, "Full name is required."),
  phone: z.string().min(1, "Phone is required."),
  source: z.enum(leadSources),
  status: z.enum(allLeadStatuses),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;

interface LeadFormProps {
  lead?: Lead | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (lead: Lead) => void;
  open: boolean;
}

function emptyValues(): LeadFormValues {
  return {
    assigned_to: "",
    campaign_id: "",
    company: "",
    email: "",
    full_name: "",
    phone: "",
    source: "website",
    status: "new",
  };
}

function valuesFromLead(lead?: Lead | null): LeadFormValues {
  if (!lead) {
    return emptyValues();
  }

  return {
    assigned_to: lead.assigned_to,
    campaign_id: lead.campaign_id ?? "",
    company: lead.company,
    email: lead.email,
    full_name: lead.full_name,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
  };
}

function fieldError(message?: string) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

function buildPayload(values: LeadFormValues, lead?: Lead | null): LeadCreate | LeadUpdate {
  return {
    assigned_to: values.assigned_to || null,
    campaign_id: values.campaign_id || null,
    company: values.company,
    email: values.email,
    full_name: values.full_name,
    phone: values.phone,
    source: values.source,
    status: lead?.status === "converted" ? "converted" : values.status,
  };
}

function sourceLabel(source: string): string {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function LeadForm({ lead, onOpenChange, onSaved, open }: LeadFormProps) {
  const queryClient = useQueryClient();
  const isConvertedLead = lead?.status === "converted";
  const form = useForm<LeadFormValues>({
    defaultValues: valuesFromLead(lead),
    resolver: zodResolver(leadFormSchema),
  });

  useEffect(() => {
    if (open) {
      form.reset(valuesFromLead(lead));
    }
  }, [form, lead, open]);

  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/"),
    queryKey: ["users", "lead-owner-select"],
    retry: false,
  });
  const campaignsQuery = useQuery({
    queryFn: () => api.get<Campaign[]>("/campaigns/", { page_size: 100 }),
    queryKey: ["campaigns", "lead-select"],
    retry: false,
  });

  const saveLead = useMutation({
    mutationFn: async (values: LeadFormValues) => {
      const payload = buildPayload(values, lead);
      const savedLead = lead
        ? await api.patch<Lead, LeadUpdate>(`/leads/${lead.id}`, payload)
        : await api.post<Lead, LeadCreate>("/leads/", payload as LeadCreate);

      await api.post(`/leads/${savedLead.id}/score`);
      return api.get<Lead>(`/leads/${savedLead.id}`);
    },
    onSuccess: (savedLead) => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved?.(savedLead);
      onOpenChange(false);
    },
  });

  const submitting = saveLead.isPending;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{lead ? "Edit Lead" : "New Lead"}</SheetTitle>
          <SheetDescription>{lead ? "Update lead details and refresh its score." : "Create a lead and calculate its score."}</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit((values) => saveLead.mutate(values))}>
          <SheetBody className="space-y-5">
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" disabled={submitting} {...form.register("full_name")} />
              {fieldError(form.formState.errors.full_name?.message)}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="lead_email">Email</Label>
                <Input id="lead_email" disabled={submitting} type="email" {...form.register("email")} />
                {fieldError(form.formState.errors.email?.message)}
              </div>
              <div>
                <Label htmlFor="lead_phone">Phone</Label>
                <Input id="lead_phone" disabled={submitting} {...form.register("phone")} />
                {fieldError(form.formState.errors.phone?.message)}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="lead_company">Company</Label>
                <Input id="lead_company" disabled={submitting} {...form.register("company")} />
                {fieldError(form.formState.errors.company?.message)}
              </div>
              <div>
                <Label htmlFor="lead_source">Source</Label>
                <select
                  className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  disabled={submitting}
                  id="lead_source"
                  {...form.register("source")}
                >
                  {leadSources.map((source) => (
                    <option key={source} value={source}>
                      {sourceLabel(source)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="lead_status">Status</Label>
              <select
                className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950 disabled:bg-slate-50 disabled:text-slate-500"
                disabled={submitting || isConvertedLead}
                id="lead_status"
                {...form.register("status")}
              >
                {(isConvertedLead ? allLeadStatuses : leadStatuses).map((status) => (
                  <option key={status} value={status}>
                    {sourceLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="lead_assigned_to">Assigned To</Label>
                <select
                  className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  disabled={submitting}
                  id="lead_assigned_to"
                  {...form.register("assigned_to")}
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
              <div>
                <Label htmlFor="lead_campaign">Campaign</Label>
                <select
                  className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  disabled={submitting}
                  id="lead_campaign"
                  {...form.register("campaign_id")}
                >
                  <option value="">No campaign</option>
                  {(campaignsQuery.data ?? []).map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isConvertedLead ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Converted leads cannot move back to an earlier status.</div>
            ) : null}

            {saveLead.isError ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Could not save lead.</div> : null}
          </SheetBody>
          <SheetFooter>
            <Button disabled={submitting} onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button className="bg-[#2563EB] hover:bg-blue-700" disabled={submitting} type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Lead
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
