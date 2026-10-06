"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusPill } from "@/components/shared/StatusPill";
import { UserForm } from "@/components/settings/UserForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import type { User, UserUpdate } from "@/types/api";

function statusBadge(active: boolean) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${active ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-slate-100 text-[var(--muted-foreground)] ring-slate-200"}`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function UsersSettingsClient() {
  const queryClient = useQueryClient();
  const { canManageUsers } = usePermissions();
  const session = authClient.useSession();
  const storedUser = useAuthStore((state) => state.user);
  const fallbackCurrentUserId = String(
    session.data?.user?.id ?? storedUser?.id ?? "",
  );
  const meQuery = useQuery({
    queryFn: () => api.get<User>("/users/me"),
    queryKey: ["users", "me"],
    retry: false,
  });
  const currentUserId = meQuery.data?.id ?? fallbackCurrentUserId;
  const [invitation, setInvitation] = useState<{
    url?: string;
    detail?: string;
  } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToToggle, setUserToToggle] = useState<User | null>(null);

  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/"),
    queryKey: ["users", "settings"],
  });

  const toggleUser = useMutation({
    mutationFn: (user: User) =>
      api.patch<User, UserUpdate>(`/users/${user.id}`, {
        is_active: !user.is_active,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  function openCreateForm() {
    setEditingUser(null);
    setFormOpen(true);
  }

  function openEditForm(user: User) {
    setEditingUser(user);
    setFormOpen(true);
  }

  const columns = useMemo<Array<DataTableColumn<User>>>(
    () => [
      {
        cell: (user) => (
          <div className="flex min-w-[180px] flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--navy)]">
              {user.full_name}
            </span>
            {user.id === currentUserId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--background)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary)]">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                You
              </span>
            ) : null}
          </div>
        ),
        header: "Name",
        id: "name",
      },
      { accessor: "email", header: "Email", id: "email" },
      {
        cell: (user) => <StatusPill status={user.role} type="role" />,
        header: "Role",
        id: "role",
      },
      {
        cell: (user) => statusBadge(user.is_active),
        header: "Status",
        id: "status",
      },
      {
        cell: (user) => formatDate(user.created_at),
        header: "Created",
        id: "created",
      },
      {
        cell: (user) => {
          if (!canManageUsers) {
            return null;
          }

          const isCurrentUser = user.id === currentUserId;
          return (
            <div className="flex min-w-[220px] flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={inviting}
                onClick={async () => {
                  setInviting(true);
                  try {
                    const response = await fetch("/api/team/invite", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: user.email }),
                    });
                    const result = await response.json();
                    if (response.ok) setInvitation({ url: result.url });
                    else
                      setInvitation({
                        detail: result.detail || "Could not create invitation.",
                      });
                  } catch {
                    setInvitation({
                      detail: "Could not create invitation. Please retry.",
                    });
                  } finally {
                    setInviting(false);
                  }
                }}
              >
                Create invitation
              </Button>
              <Button
                onClick={() => openEditForm(user)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Edit className="h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              <Button
                disabled={isCurrentUser || toggleUser.isPending}
                onClick={() => setUserToToggle(user)}
                size="sm"
                title={
                  isCurrentUser ? "You cannot deactivate yourself." : undefined
                }
                type="button"
                variant="outline"
              >
                {user.is_active ? (
                  <ToggleRight
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden="true"
                  />
                ) : (
                  <ToggleLeft className="h-4 w-4" aria-hidden="true" />
                )}
                {user.is_active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          );
        },
        header: "Actions",
        id: "actions",
      },
    ],
    [canManageUsers, currentUserId, toggleUser, inviting],
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        primaryAction={
          canManageUsers
            ? { icon: Plus, label: "Invite User", onClick: openCreateForm }
            : undefined
        }
        subtitle="Manage CRM users, roles, and access status."
        title="User Management"
      />

      <Dialog
        open={!!invitation}
        onOpenChange={(open) => {
          if (!open) setInvitation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account invitation</DialogTitle>
            <DialogDescription>
              Share the private link with the intended recipient. It expires in
              48 hours and replaces older invitations. No email has been sent.
            </DialogDescription>
          </DialogHeader>
          {invitation?.url ? (
            <>
              <Input
                aria-label="Invitation link"
                value={invitation.url}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <Button
                onClick={() => navigator.clipboard.writeText(invitation.url!)}
              >
                Copy invitation link
              </Button>
            </>
          ) : (
            <p role="alert">{invitation?.detail}</p>
          )}
        </DialogContent>
      </Dialog>
      <DataTable
        columns={columns}
        data={usersQuery.data ?? []}
        emptyMessage="No users found."
        getRowClassName={(user) =>
          user.id === currentUserId ? "bg-[var(--background)]/60" : undefined
        }
        getRowKey={(user) => user.id}
        isLoading={usersQuery.isLoading}
        error={usersQuery.isError}
        onRetry={() => usersQuery.refetch()}
      />

      {usersQuery.isError ? (
        <div className="rounded-xl border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">
          Could not load users.
        </div>
      ) : null}

      {canManageUsers ? (
        <>
          <UserForm
            onOpenChange={setFormOpen}
            open={formOpen}
            user={editingUser}
          />
          <ConfirmDialog
            isPending={toggleUser.isPending}
            onConfirm={() => {
              if (userToToggle) {
                toggleUser.mutate(userToToggle, {
                  onSuccess: () => setUserToToggle(null),
                });
              }
            }}
            onOpenChange={(open) => {
              if (!open) {
                setUserToToggle(null);
              }
            }}
            open={Boolean(userToToggle)}
            title={
              userToToggle?.is_active ? "Deactivate user" : "Activate user"
            }
          />
        </>
      ) : null}
    </div>
  );
}
