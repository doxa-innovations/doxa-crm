"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { api } from "@/lib/api";
import type { Activity, ActivityCreate } from "@/types/api";

const activitySchema = z.object({
  body: z.string().min(1, "Body is required."),
  outcome: z.string().optional(),
  subject: z.string().min(1, "Subject is required."),
  type: z.enum(["call", "email", "meeting", "note"]),
});

type ActivityFormValues = z.infer<typeof activitySchema>;

interface DealActivityDialogProps {
  accountId?: string | null;
  contactId?: string | null;
  dealId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function fieldError(message?: string) {
  return message ? (
    <p className="mt-1 text-xs text-red-600">{message}</p>
  ) : null;
}

export function DealActivityDialog({
  accountId,
  contactId,
  dealId,
  onOpenChange,
  open,
}: DealActivityDialogProps) {
  const queryClient = useQueryClient();
  const form = useForm<ActivityFormValues>({
    defaultValues: {
      body: "",
      outcome: "",
      subject: "",
      type: "call",
    },
    resolver: zodResolver(activitySchema),
  });
  const createActivity = useMutation({
    mutationFn: (values: ActivityFormValues) =>
      api.post<Activity, ActivityCreate>("/activities/", {
        account_id: accountId ?? null,
        body: values.body,
        contact_id: contactId ?? null,
        deal_id: dealId,
        outcome: values.outcome || null,
        subject: values.subject,
        type: values.type,
      }),
    onSuccess: () => {
      form.reset();
      void queryClient.invalidateQueries({
        queryKey: ["deals", "detail", dealId],
      });
      onOpenChange(false);
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
          <DialogDescription>
            Add a call, email, meeting, or note to this deal.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            createActivity.mutate(values),
          )}
        >
          <div>
            <Label htmlFor="deal_activity_type">Type</Label>
            <select
              className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
              id="deal_activity_type"
              {...form.register("type")}
            >
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="note">Note</option>
            </select>
          </div>
          <div>
            <Label htmlFor="deal_activity_subject">Subject</Label>
            <Input id="deal_activity_subject" {...form.register("subject")} />
            {fieldError(form.formState.errors.subject?.message)}
          </div>
          <div>
            <Label htmlFor="deal_activity_body">Body</Label>
            <textarea
              className="min-h-28 w-full rounded-md border border-[var(--input)] bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              id="deal_activity_body"
              {...form.register("body")}
            />
            {fieldError(form.formState.errors.body?.message)}
          </div>
          <div>
            <Label htmlFor="deal_activity_outcome">Outcome</Label>
            <Input id="deal_activity_outcome" {...form.register("outcome")} />
          </div>
          {createActivity.isError ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              Could not log activity.
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
              disabled={createActivity.isPending}
              type="submit"
            >
              Save Activity
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
