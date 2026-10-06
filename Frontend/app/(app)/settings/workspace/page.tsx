"use client";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { User } from "@/types/api";
export default function Workspace() {
  const health = useQuery({
    queryKey: ["workspace", "health"],
    queryFn: () =>
      api.get<Record<string, boolean | string>>("/workspace/health"),
  });
  const users = useQuery({
    queryKey: ["users", "directory"],
    queryFn: () => api.get<User[]>("/users/directory"),
  });
  const client = useQueryClient();
  const quotas = useQuery({
    queryKey: ["workspace", "quotas"],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          quota_amount: string;
          currency: string;
        }>
      >("/workspace/quotas"),
  });
  const save = useMutation({
    mutationFn: (data: Record<string, FormDataEntryValue>) =>
      api.post("/workspace/quotas", data),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["workspace", "quotas"] }),
  });
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Workspace readiness</h1>
      <p className="text-sm text-slate-600">
        Configuration checks do not prove delivery. Complete a staging send,
        upload/download, and search check before inviting your team.
      </p>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Set up your workspace</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <Link className="text-blue-700 underline" href="/settings/users">
              Create your team and issue private invitations.
            </Link>
          </li>
          <li>
            <Link className="text-blue-700 underline" href="/settings/pipeline">
              Review pipeline stages and probabilities.
            </Link>
          </li>
          <li>
            <Link className="text-blue-700 underline" href="/dashboard">
              Choose the reporting currency.
            </Link>{" "}
            Dates use each team member’s browser time zone.
          </li>
          <li>
            <Link className="text-blue-700 underline" href="/leads">
              Import a small sample of leads and review the result.
            </Link>
          </li>
          <li>
            Configure the services below, then verify email, search, and
            document sharing with test records.
          </li>
        </ol>
      </section>
      {health.isPending && <p role="status">Checking configuration…</p>}
      {health.isError ? (
        <p role="alert">
          {apiErrorDetail(health.error)}{" "}
          <button onClick={() => health.refetch()}>Retry</button>
        </p>
      ) : (
        <dl className="divide-y rounded-xl bg-white p-5">
          {Object.entries(health.data ?? {})
            .filter(([key]) => key !== "note")
            .map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4 py-3">
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd className={value ? "text-teal-700" : "text-amber-800"}>
                  {value ? "Configured" : "Needs configuration"}
                </dd>
              </div>
            ))}
        </dl>
      )}
      <p className="text-sm">
        An administrator configures provider credentials on the server. No
        secrets are exposed here.
      </p>
      <h2 className="text-xl font-semibold">Sales quotas</h2>
      <form
        className="grid gap-3 rounded-xl bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <label>
          Team member
          <select
            name="user_id"
            className="block w-full rounded border p-2"
            required
          >
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Period start
          <Input type="date" name="period_start" required />
        </label>
        <label>
          Period end
          <Input type="date" name="period_end" required />
        </label>
        <label>
          Amount
          <Input
            type="number"
            min="0.01"
            step="0.01"
            name="quota_amount"
            required
          />
        </label>
        <label>
          Currency
          <Input
            name="currency"
            defaultValue="USD"
            pattern="[A-Z]{3}"
            maxLength={3}
            required
          />
        </label>
        <Button disabled={save.isPending || users.isPending || users.isError}>
          Save quota
        </Button>
        {users.isError && (
          <p role="alert">
            Team members could not be loaded.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => users.refetch()}
            >
              Retry
            </button>
          </p>
        )}
        {save.isSuccess && <p role="status">Quota saved.</p>}
        {save.isError && <p role="alert">{apiErrorDetail(save.error)}</p>}
      </form>
      {quotas.isError && (
        <p role="alert">
          {apiErrorDetail(quotas.error)}{" "}
          <button className="underline" onClick={() => quotas.refetch()}>
            Retry
          </button>
        </p>
      )}
      {quotas.isPending && <p role="status">Loading quotas…</p>}
      <ul className="divide-y">
        {quotas.data?.map((q) => (
          <li className="py-3 text-sm" key={q.id}>
            {users.data?.find((u) => u.id === q.user_id)?.full_name ??
              "Team member"}{" "}
            · {q.period_start}–{q.period_end}: {q.currency} {q.quota_amount}
          </li>
        ))}
      </ul>
    </div>
  );
}
