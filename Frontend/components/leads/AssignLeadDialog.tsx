"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Lead, LeadAssignRequest, User } from "@/types/api";

interface AssignLeadDialogProps {
  leadIds: string[];
  onAssigned?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AssignLeadDialog({
  leadIds,
  onAssigned,
  onOpenChange,
  open,
}: AssignLeadDialogProps) {
  const queryClient = useQueryClient();
  const [failedIds, setFailedIds] = useState<string[] | null>(null);
  const [resultMessage, setResultMessage] = useState("");
  const [userId, setUserId] = useState("");
  useEffect(() => {
    if (open) {
      setFailedIds(null);
      setResultMessage("");
      setUserId("");
    }
  }, [open]);
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/directory"),
    queryKey: ["users", "sales-rep-select"],
    retry: false,
  });
  const salesReps = (usersQuery.data ?? []).filter(
    (user) => user.is_active && user.role === "sales_rep",
  );
  const assignMutation = useMutation({
    mutationFn: async () => {
      const ids = failedIds ?? leadIds;
      const results = await Promise.allSettled(
        ids.map((leadId) =>
          api.post<Lead, LeadAssignRequest>(`/leads/${leadId}/assign`, {
            method: "manual",
            user_id: userId,
          }),
        ),
      );
      return {
        failed: ids.filter((_, i) => results[i].status === "rejected"),
        succeeded: results.filter((r) => r.status === "fulfilled").length,
      };
    },
    meta: { suppressToast: true },
    onSuccess: ({ failed, succeeded }) => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      setFailedIds(failed);
      setResultMessage(
        `${succeeded} assigned. ${failed.length} failed. ${failed.length ? "Retry will only include failed records." : ""}`,
      );
      if (!failed.length) onAssigned?.();
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Assign Lead{leadIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>Select an active sales rep.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="assign_user">Sales Rep</Label>
            <select
              className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
              id="assign_user"
              onChange={(event) => setUserId(event.target.value)}
              value={userId}
            >
              <option value="">Choose rep</option>
              {salesReps.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name}
                </option>
              ))}
            </select>
          </div>
          {resultMessage && <p role="status">{resultMessage}</p>}
          {assignMutation.isError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not assign lead.
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
              disabled={
                !userId || assignMutation.isPending || failedIds?.length === 0
              }
              onClick={() => assignMutation.mutate()}
              type="button"
            >
              Assign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
