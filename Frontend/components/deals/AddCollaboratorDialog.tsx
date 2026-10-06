"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import type {
  DealCollaboratorCreate,
  DealDetailResponse,
  User,
} from "@/types/api";

interface AddCollaboratorDialogProps {
  dealId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AddCollaboratorDialog({
  dealId,
  onOpenChange,
  open,
}: AddCollaboratorDialogProps) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("collaborator");
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/directory"),
    queryKey: ["users", "deal-collaborator-select"],
    retry: false,
  });
  const addCollaborator = useMutation({
    mutationFn: () =>
      api.post<DealDetailResponse, DealCollaboratorCreate>(
        `/deals/${dealId}/collaborators`,
        {
          role,
          user_id: userId,
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["deals", "detail", dealId],
      });
      onOpenChange(false);
      setUserId("");
      setRole("collaborator");
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Collaborator</DialogTitle>
          <DialogDescription>Add another user to this deal.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="collaborator_user">User</Label>
            <select
              className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
              id="collaborator_user"
              onChange={(event) => setUserId(event.target.value)}
              value={userId}
            >
              <option value="">Choose user</option>
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
            <Label htmlFor="collaborator_role">Role</Label>
            <Input
              id="collaborator_role"
              onChange={(event) => setRole(event.target.value)}
              value={role}
            />
          </div>
          {addCollaborator.isError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not add collaborator.
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
              disabled={!userId || addCollaborator.isPending}
              onClick={() => addCollaborator.mutate()}
              type="button"
            >
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
