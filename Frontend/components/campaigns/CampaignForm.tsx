"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import type { Campaign, CampaignCreate, CampaignType, CampaignUpdate } from "@/types/api";

const campaignTypes: CampaignType[] = ["email", "sms", "event", "social", "cold_call"];

const campaignFormSchema = z.object({
  budget: z.string().optional(),
  end_date: z.string().min(1, "End date is required."),
  name: z.string().min(1, "Name is required."),
  start_date: z.string().min(1, "Start date is required."),
  type: z.enum(["email", "sms", "event", "social", "cold_call"]),
});

type CampaignFormValues = z.infer<typeof campaignFormSchema>;

interface CampaignFormProps {
  campaign?: Campaign | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (campaign: Campaign) => void;
  open: boolean;
}

function defaultStartDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function valuesFromCampaign(campaign?: Campaign | null): CampaignFormValues {
  return {
    budget: campaign ? String(campaign.budget) : "",
    end_date: campaign?.end_date ?? defaultEndDate(),
    name: campaign?.name ?? "",
    start_date: campaign?.start_date ?? defaultStartDate(),
    type: campaign?.type ?? "email",
  };
}

function optionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fieldError(message?: string) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

function buildPayload(values: CampaignFormValues): CampaignCreate | CampaignUpdate {
  return {
    budget: values.budget ? Number(values.budget) : 0,
    end_date: values.end_date,
    name: values.name,
    start_date: values.start_date,
    type: values.type,
  };
}

export function CampaignForm({ campaign, onOpenChange, onSaved, open }: CampaignFormProps) {
  const queryClient = useQueryClient();
  const form = useForm<CampaignFormValues>({
    defaultValues: valuesFromCampaign(campaign),
    resolver: zodResolver(campaignFormSchema),
  });

  useEffect(() => {
    if (open) {
      form.reset(valuesFromCampaign(campaign));
    }
  }, [campaign, form, open]);

  const saveCampaign = useMutation({
    mutationFn: (values: CampaignFormValues) => {
      const payload = buildPayload(values);
      if (campaign) {
        return api.patch<Campaign, CampaignUpdate>(`/campaigns/${campaign.id}`, payload as CampaignUpdate);
      }

      return api.post<Campaign, CampaignCreate>("/campaigns/", payload as CampaignCreate);
    },
    onSuccess: (savedCampaign) => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved?.(savedCampaign);
      onOpenChange(false);
    },
  });

  const submitting = saveCampaign.isPending;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{campaign ? "Edit Campaign" : "New Campaign"}</SheetTitle>
          <SheetDescription>{campaign ? "Update campaign timing and budget." : "Create a campaign draft."}</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit((values) => saveCampaign.mutate(values))}>
          <SheetBody className="space-y-5">
            <div>
              <Label htmlFor="campaign_name">Name</Label>
              <Input id="campaign_name" disabled={submitting} {...form.register("name")} />
              {fieldError(form.formState.errors.name?.message)}
            </div>

            <div>
              <Label htmlFor="campaign_type">Type</Label>
              <select
                className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                disabled={submitting}
                id="campaign_type"
                {...form.register("type")}
              >
                {campaignTypes.map((type) => (
                  <option key={type} value={type}>
                    {optionLabel(type)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="campaign_start">Start Date</Label>
                <Input id="campaign_start" disabled={submitting} type="date" {...form.register("start_date")} />
                {fieldError(form.formState.errors.start_date?.message)}
              </div>
              <div>
                <Label htmlFor="campaign_end">End Date</Label>
                <Input id="campaign_end" disabled={submitting} type="date" {...form.register("end_date")} />
                {fieldError(form.formState.errors.end_date?.message)}
              </div>
            </div>

            <div>
              <Label htmlFor="campaign_budget">Budget</Label>
              <Input id="campaign_budget" disabled={submitting} min="0" step="100" type="number" {...form.register("budget")} />
            </div>

            {saveCampaign.isError ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Could not save campaign.</div> : null}
          </SheetBody>
          <SheetFooter>
            <Button disabled={submitting} onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button className="bg-[#2563EB] hover:bg-blue-700" disabled={submitting} type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Campaign
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
