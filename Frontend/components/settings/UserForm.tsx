"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
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
import { CRM_ROLES, type CrmRole } from "@/lib/auth-types";
import type { User, UserCreate, UserUpdate } from "@/types/api";

const userFormSchema = z.object({
  email: z.string().email("Enter a valid email address.").optional(),
  full_name: z.string().min(1, "Full name is required."),
  is_active: z.boolean(),
  role: z.enum(CRM_ROLES),
});

type UserFormValues = z.infer<typeof userFormSchema>;

interface UserFormProps {
  onOpenChange: (open: boolean) => void;
  onSaved?: (user: User) => void;
  open: boolean;
  user?: User | null;
}

function humanRole(role: CrmRole): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function valuesFromUser(user?: User | null): UserFormValues {
  return {
    email: user?.email ?? "",
    full_name: user?.full_name ?? "",
    is_active: user?.is_active ?? true,
    role: user?.role ?? "sales_rep",
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

export function UserForm({ onOpenChange, onSaved, open, user }: UserFormProps) {
  const queryClient = useQueryClient();
  const [inviteUrl, setInviteUrl] = useState("");
  const [created, setCreated] = useState<User | null>(null);
  const form = useForm<UserFormValues>({
    defaultValues: valuesFromUser(user),
    resolver: zodResolver(userFormSchema),
  });

  useEffect(() => {
    if (open) {
      setInviteUrl("");
      setCreated(null);
      form.reset(valuesFromUser(user));
    }
  }, [form, open, user]);

  const saveUser = useMutation({
    mutationFn: (values: UserFormValues) => {
      if (created && !user) return Promise.resolve(created);
      if (user) {
        return api.patch<User, UserUpdate>(`/users/${user.id}`, {
          full_name: values.full_name,
          is_active: values.is_active,
          role: values.role,
        });
      }

      return api.post<User, UserCreate>("/users/", {
        email: values.email ?? "",
        full_name: values.full_name,
        is_active: values.is_active,
        role: values.role,
      });
    },
    onSuccess: async (savedUser) => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      onSaved?.(savedUser);
      if (!user) {
        setCreated(savedUser);
        const response = await fetch("/api/team/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: savedUser.email }),
        });
        const body = await response.json();
        if (response.ok) setInviteUrl(body.url);
        else {
          setInviteUrl("");
          form.setError("root", {
            message:
              body.detail ||
              "User created, but invitation failed. Use Create invitation from the user list to retry.",
          });
        }
      } else onOpenChange(false);
    },
  });

  const submitting = saveUser.isPending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{user ? "Edit User" : "Invite User"}</DialogTitle>
          <DialogDescription>
            {user
              ? "Update role and account status."
              : "Create an account and a secure invitation link valid for 48 hours."}
          </DialogDescription>
        </DialogHeader>
        {inviteUrl ? (
          <div className="grid gap-3">
            <p role="status">
              Account created. Share this private invitation link with the
              recipient. No email has been sent. The link expires in 48 hours
              and can be used once.
            </p>
            <Input
              aria-label="Invitation link"
              value={inviteUrl}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <Button onClick={() => navigator.clipboard.writeText(inviteUrl)}>
              Copy invitation link
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-5"
            onSubmit={form.handleSubmit((values) => saveUser.mutate(values))}
          >
            {!user ? (
              <div>
                <Label htmlFor="user_email">Email</Label>
                <Input
                  id="user_email"
                  disabled={submitting}
                  type="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  aria-describedby={
                    form.formState.errors.email ? "email-error" : undefined
                  }
                  {...form.register("email")}
                />
                {fieldError(form.formState.errors.email?.message, "email")}
              </div>
            ) : null}

            <div>
              <Label htmlFor="user_full_name">Full Name</Label>
              <Input
                id="user_full_name"
                disabled={submitting}
                aria-invalid={Boolean(form.formState.errors.full_name)}
                aria-describedby={
                  form.formState.errors.full_name
                    ? "full_name-error"
                    : undefined
                }
                {...form.register("full_name")}
              />
              {fieldError(
                form.formState.errors.full_name?.message,
                "full_name",
              )}
            </div>

            <div>
              <Label htmlFor="user_role">Role</Label>
              <select
                className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                disabled={submitting}
                id="user_role"
                aria-invalid={Boolean(form.formState.errors.role)}
                aria-describedby={
                  form.formState.errors.role ? "role-error" : undefined
                }
                {...form.register("role")}
              >
                {CRM_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {humanRole(role)}
                  </option>
                ))}
              </select>
            </div>

            {user ? (
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm text-[var(--navy)]">
                <input
                  className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
                  disabled={submitting}
                  type="checkbox"
                  aria-invalid={Boolean(form.formState.errors.is_active)}
                  aria-describedby={
                    form.formState.errors.is_active
                      ? "is_active-error"
                      : undefined
                  }
                  {...form.register("is_active")}
                />
                Active user
              </label>
            ) : null}

            {form.formState.errors.root && (
              <p role="alert" className="text-red-700">
                {form.formState.errors.root.message}
              </p>
            )}
            {saveUser.isError ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {apiErrorDetail(saveUser.error, "Could not save user.")}
              </div>
            ) : null}

            <div className="grid gap-3 sm:flex sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={submitting}
                type="submit"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Save User
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
