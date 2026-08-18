"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Lead, LeadConvertRequest, LeadConvertResponse, Pipeline } from "@/types/api";

const convertSchema = z.object({
  account_name: z.string().optional(),
  create_account: z.boolean(),
  create_deal: z.boolean(),
  deal_title: z.string().optional(),
  deal_value: z.string().optional(),
  pipeline_id: z.string().optional(),
});

type ConvertFormValues = z.infer<typeof convertSchema>;

interface ConvertModalProps {
  lead: Lead;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ConvertModal({ lead, onOpenChange, open }: ConvertModalProps) {
  const queryClient = useQueryClient();
  const form = useForm<ConvertFormValues>({
    defaultValues: {
      account_name: lead.company,
      create_account: true,
      create_deal: false,
      deal_title: `${lead.company} opportunity`,
      deal_value: "",
      pipeline_id: "",
    },
    resolver: zodResolver(convertSchema),
  });
  const createAccount = form.watch("create_account");
  const createDeal = form.watch("create_deal");
  const isAlreadyConverted = lead.status === "converted";

  const pipelinesQuery = useQuery({
    queryFn: () => api.get<Pipeline[]>("/pipelines/"),
    queryKey: ["pipelines", "convert-select"],
  });
  const defaultPipeline = (pipelinesQuery.data ?? []).find((pipeline) => pipeline.is_default) ?? pipelinesQuery.data?.[0];

  useEffect(() => {
    if (open) {
      form.reset({
        account_name: lead.company,
        create_account: true,
        create_deal: false,
        deal_title: `${lead.company} opportunity`,
        deal_value: "",
        pipeline_id: defaultPipeline?.id ?? "",
      });
    }
  }, [defaultPipeline?.id, form, lead.company, open]);

  useEffect(() => {
    if (defaultPipeline?.id && !form.getValues("pipeline_id")) {
      form.setValue("pipeline_id", defaultPipeline.id);
    }
  }, [defaultPipeline?.id, form]);

  const convertLead = useMutation({
    mutationFn: (values: ConvertFormValues) =>
      api.post<LeadConvertResponse, LeadConvertRequest>(`/leads/${lead.id}/convert`, {
        account_name: values.create_account ? values.account_name || lead.company : null,
        create_account: values.create_account,
        create_deal: values.create_deal,
        deal_title: values.create_deal ? values.deal_title || `${lead.company} opportunity` : null,
        deal_value: values.create_deal ? Number(values.deal_value || 0) : null,
        pipeline_id: values.create_deal ? values.pipeline_id || null : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    meta: {
      successMessage: isAlreadyConverted ? "Contact record ready" : "Lead converted",
    },
  });

  const result = convertLead.data;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          convertLead.reset();
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isAlreadyConverted ? "Lead Contact" : "Convert Lead"}</DialogTitle>
          <DialogDescription>
            {isAlreadyConverted
              ? "Find the contact record for this converted lead."
              : "Create a contact, and optionally create an account and deal."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid gap-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {isAlreadyConverted ? "Contact record ready" : "Lead converted"}
              </div>
            </div>
            <div className="grid gap-2 text-sm">
              <Link className="font-medium text-[#2563EB] hover:underline" href={`/contacts/${result.contact_id}`}>
                Open contact
              </Link>
              {result.account_id ? (
                <Link className="font-medium text-[#2563EB] hover:underline" href={`/accounts/${result.account_id}`}>
                  Open account
                </Link>
              ) : null}
              {result.deal_id ? (
                <Link className="font-medium text-[#2563EB] hover:underline" href={`/deals/${result.deal_id}`}>
                  Open deal
                </Link>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)} type="button">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={form.handleSubmit((values) => convertLead.mutate(values))}>
            <label className="flex items-center gap-2 text-sm font-medium text-[#0F2444]">
              <input className="h-4 w-4 rounded border-slate-300" type="checkbox" {...form.register("create_account")} />
              Create Account?
            </label>
            {createAccount ? (
              <div>
                <Label htmlFor="convert_account_name">Account Name</Label>
                <Input id="convert_account_name" {...form.register("account_name")} />
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm font-medium text-[#0F2444]">
              <input className="h-4 w-4 rounded border-slate-300" type="checkbox" {...form.register("create_deal")} />
              Create Deal?
            </label>
            {createDeal ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="convert_deal_title">Deal Title</Label>
                  <Input id="convert_deal_title" {...form.register("deal_title")} />
                </div>
                <div>
                  <Label htmlFor="convert_deal_value">Value</Label>
                  <Input id="convert_deal_value" min="0" step="100" type="number" {...form.register("deal_value")} />
                </div>
                <div>
                  <Label htmlFor="convert_pipeline">Pipeline</Label>
                  <select
                    className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                    id="convert_pipeline"
                    {...form.register("pipeline_id")}
                  >
                    {(pipelinesQuery.data ?? []).map((pipeline) => (
                      <option key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {createDeal && !createAccount ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Deal conversion requires an existing account named {lead.company}.
              </div>
            ) : null}
            {isAlreadyConverted ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This lead is already marked converted. Submitting will find the existing contact, or create it if missing.
              </div>
            ) : null}
            {convertLead.isError ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Could not convert lead.</div> : null}

            <div className="flex justify-end gap-3">
              <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button className="bg-[#2563EB] hover:bg-blue-700" disabled={convertLead.isPending} type="submit">
                {isAlreadyConverted ? "Find Contact" : "Convert Lead"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
