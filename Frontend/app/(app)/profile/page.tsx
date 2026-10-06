"use client";
import { usePreference } from "@/hooks/usePreference";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import type { User } from "@/types/api";
export default function Profile() {
  const preferences = usePreference<{ tasks: boolean; deals: boolean }>(
    "notification-settings",
    { tasks: true, deals: true },
  );
  const query = useQuery({
    queryKey: ["users", "me"],
    queryFn: () => api.get<User>("/users/me"),
  });
  if (query.isError)
    return (
      <p role="alert">
        Could not load your profile.{" "}
        <button onClick={() => query.refetch()}>Retry</button>
      </p>
    );
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      {query.data ? (
        <dl className="grid gap-4 rounded-xl bg-white p-6">
          <div>
            <dt className="text-sm text-slate-600">Name</dt>
            <dd>{query.data.full_name}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Email</dt>
            <dd>{query.data.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Role</dt>
            <dd>{query.data.role.replaceAll("_", " ")}</dd>
          </div>
        </dl>
      ) : (
        <p>Loading profile…</p>
      )}
      <fieldset className="grid gap-3">
        <legend className="mb-3 font-semibold">Notifications</legend>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={preferences.value.tasks}
            disabled={preferences.isPending}
            onChange={(e) =>
              preferences.save({
                ...preferences.value,
                tasks: e.target.checked,
              })
            }
          />
          Overdue task alerts
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={preferences.value.deals}
            disabled={preferences.isPending}
            onChange={(e) =>
              preferences.save({
                ...preferences.value,
                deals: e.target.checked,
              })
            }
          />
          Quiet deal alerts
        </label>
      </fieldset>
      <Link className="text-blue-700 underline" href="/forgot-password">
        Reset your password
      </Link>
      <p className="text-sm text-slate-600">
        Contact your administrator to change your name, email, or role.
      </p>
    </div>
  );
}
