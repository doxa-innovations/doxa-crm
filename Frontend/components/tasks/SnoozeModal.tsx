"use client";
import { toLocalDateTime } from "@/lib/utils";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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
import type { Task, TaskSnoozeRequest } from "@/types/api";

interface SnoozeModalProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  task?: Task | null;
}

function defaultSnoozeValue(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toLocalDateTime(date);
}

export function SnoozeModal({ onOpenChange, open, task }: SnoozeModalProps) {
  const queryClient = useQueryClient();
  const [newDue, setNewDue] = useState(defaultSnoozeValue());
  const snoozeTask = useMutation({
    mutationFn: () =>
      api.post<Task, TaskSnoozeRequest>(`/tasks/${task?.id}/snooze`, {
        new_due: new Date(newDue).toISOString(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onOpenChange(false);
      setNewDue(defaultSnoozeValue());
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Snooze until...</DialogTitle>
          <DialogDescription>
            Move the due date for {task?.title ?? "this task"}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="snooze_due">New due date</Label>
            <Input
              className="[color-scheme:light] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100"
              id="snooze_due"
              onChange={(event) => setNewDue(event.target.value)}
              type="datetime-local"
              value={newDue}
            />
          </div>
          {snoozeTask.isError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not snooze task.
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
              disabled={!task || snoozeTask.isPending || !newDue}
              onClick={() => snoozeTask.mutate()}
              type="button"
            >
              Snooze
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
