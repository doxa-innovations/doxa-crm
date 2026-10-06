"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
  CampaignSequenceChannel,
  CampaignSequenceStep,
  CampaignStepCreate,
  CampaignStepUpdate,
} from "@/types/api";

const stepSchema = z.object({
  body: z.string().optional(),
  channel: z.enum(["email", "sms", "call", "task", "social"]),
  delay_days: z.string().min(1, "Delay is required."),
  subject: z.string().min(1, "Subject is required."),
  variant: z.string().optional(),
});

type StepFormValues = z.infer<typeof stepSchema>;

interface SequenceStepFormProps {
  campaignId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  previousStepNumber?: number;
  step?: CampaignSequenceStep | null;
}

function valuesFromStep(step?: CampaignSequenceStep | null): StepFormValues {
  return {
    body: step?.body ?? "",
    channel: step?.channel ?? "email",
    delay_days: String(step?.delay_days ?? 0),
    subject: step?.subject ?? "",
    variant: step?.variant ?? "",
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

function buildPayload(
  values: StepFormValues,
): CampaignStepCreate | CampaignStepUpdate {
  return {
    body: values.body || null,
    channel: values.channel,
    delay_days: Number(values.delay_days),
    subject: values.subject,
    variant: values.variant || null,
  };
}

const channelOptions: Array<{ label: string; value: CampaignSequenceChannel }> =
  [
    { label: "Email", value: "email" },
    { label: "SMS", value: "sms" },
    { label: "Call", value: "call" },
    { label: "Task", value: "task" },
    { label: "Social", value: "social" },
  ];

function bodyLabel(channel: CampaignSequenceChannel): string {
  if (channel === "sms") {
    return "SMS Message";
  }

  return "Body";
}

function subjectLabel(channel: CampaignSequenceChannel): string {
  return channel === "email" ? "Subject" : "Step Name";
}

export function SequenceStepForm({
  campaignId,
  onOpenChange,
  open,
  previousStepNumber = 1,
  step,
}: SequenceStepFormProps) {
  const queryClient = useQueryClient();
  const form = useForm<StepFormValues>({
    defaultValues: valuesFromStep(step),
    resolver: zodResolver(stepSchema),
  });
  const selectedChannel = form.watch("channel");
  const bodyValue = form.watch("body") ?? "";

  useEffect(() => {
    if (open) {
      form.reset(valuesFromStep(step));
    }
  }, [form, open, step]);

  const saveStep = useMutation({
    mutationFn: (values: StepFormValues) => {
      const payload = buildPayload(values);
      if (step) {
        return api.patch<CampaignSequenceStep, CampaignStepUpdate>(
          `/campaigns/${campaignId}/steps/${step.id}`,
          payload as CampaignStepUpdate,
        );
      }

      return api.post<CampaignSequenceStep, CampaignStepCreate>(
        `/campaigns/${campaignId}/steps`,
        payload as CampaignStepCreate,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({
        queryKey: ["campaigns", "steps", campaignId],
      });
      onOpenChange(false);
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step ? "Edit Sequence Step" : "Add Sequence Step"}
          </DialogTitle>
          <DialogDescription>
            Choose the channel, message, and timing in the sequence.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) => saveStep.mutate(values))}
        >
          <div>
            <Label htmlFor="step_channel">Channel</Label>
            <select
              className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
              id="step_channel"
              aria-invalid={Boolean(form.formState.errors.channel)}
              aria-describedby={
                form.formState.errors.channel ? "channel-error" : undefined
              }
              {...form.register("channel")}
            >
              {channelOptions.map((channel) => (
                <option key={channel.value} value={channel.value}>
                  {channel.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="step_delay">Delay Days</Label>
            <Input
              id="step_delay"
              min="0"
              type="number"
              aria-invalid={Boolean(form.formState.errors.delay_days)}
              aria-describedby={
                form.formState.errors.delay_days
                  ? "delay_days-error"
                  : undefined
              }
              {...form.register("delay_days")}
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              days after step {previousStepNumber}
            </p>
            {fieldError(
              form.formState.errors.delay_days?.message,
              "delay_days",
            )}
          </div>
          <div>
            <Label htmlFor="step_subject">
              {subjectLabel(selectedChannel)}
            </Label>
            <Input
              id="step_subject"
              aria-invalid={Boolean(form.formState.errors.subject)}
              aria-describedby={
                form.formState.errors.subject ? "subject-error" : undefined
              }
              {...form.register("subject")}
            />
            {fieldError(form.formState.errors.subject?.message, "subject")}
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="step_body">{bodyLabel(selectedChannel)}</Label>
              {selectedChannel === "sms" ? (
                <span className="text-xs text-[var(--muted-foreground)]">
                  {bodyValue.length}/160
                </span>
              ) : null}
            </div>
            <textarea
              className="min-h-40 w-full rounded-md border border-[var(--input)] bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              id="step_body"
              aria-invalid={Boolean(form.formState.errors.body)}
              aria-describedby={
                form.formState.errors.body ? "body-error" : undefined
              }
              {...form.register("body")}
            />
          </div>
          <div>
            <Label htmlFor="step_variant">Variant</Label>
            <select
              className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm"
              id="step_variant"
              aria-invalid={Boolean(form.formState.errors.variant)}
              aria-describedby={
                form.formState.errors.variant ? "variant-error" : undefined
              }
              {...form.register("variant")}
            >
              <option value="">No variant</option>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </div>
          {saveStep.isError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not save step.
            </div>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-[var(--primary)] hover:bg-blue-700"
              disabled={saveStep.isPending}
              type="submit"
            >
              Save Step
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
