"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
export default function Archive() {
  const [entity, setEntity] = useState("leads");
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState(false);
  const client = useQueryClient();
  const records = useQuery({
    queryKey: ["workspace", entity, page, history],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          name?: string;
          actor?: string;
          action?: string;
          created_at?: string;
          changes?: string[];
          record_id?: string;
          before?: Record<string, unknown>;
          after?: Record<string, unknown>;
        }>
      >(history ? "/workspace/history" : `/workspace/archive/${entity}`, {
        page,
        entity,
      }),
  });
  const restore = useMutation({
    mutationFn: (id: string) =>
      api.post(`/workspace/archive/${entity}/${id}/restore`),
    onSuccess: () => client.invalidateQueries(),
  });
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold">Archive & history</h1>
      <p>
        Restore archived records or review who changed them. History is retained
        when records are archived.
      </p>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Record type"
          className="rounded border p-2"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
        >
          {["leads", "contacts", "accounts", "deals", "projects"].map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <Button
          variant="outline"
          onClick={() => {
            setHistory(!history);
            setPage(1);
          }}
        >
          {history ? "View archive" : "View history"}
        </Button>
      </div>
      {restore.isError && <p role="alert">{apiErrorDetail(restore.error)}</p>}
      {restore.isSuccess && <p role="status">Record restored.</p>}
      {records.isError ? (
        <p role="alert">
          {apiErrorDetail(records.error)}{" "}
          <button onClick={() => records.refetch()}>Retry</button>
        </p>
      ) : records.isLoading ? (
        <p>Loading…</p>
      ) : (
        <ul className="divide-y rounded-xl bg-white p-5">
          {records.data?.map((r) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 py-4"
              key={r.id}
            >
              {history ? (
                <div>
                  <p>
                    {r.actor} · {r.action}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {new Date(r.created_at!).toLocaleString()} · Fields:{" "}
                    {r.changes?.join(", ")}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-500">
                    Record: {r.record_id}
                  </p>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer">
                      View changed values
                    </summary>
                    <dl className="mt-2 grid gap-2">
                      {Array.from(
                        new Set([
                          ...Object.keys(r.before ?? {}),
                          ...Object.keys(r.after ?? {}),
                        ]),
                      ).map((key) => (
                        <div key={key}>
                          <dt className="font-medium">
                            {key.replaceAll("_", " ")}
                          </dt>
                          <dd className="break-all">
                            {JSON.stringify(r.before?.[key] ?? null)} →{" "}
                            {JSON.stringify(r.after?.[key] ?? null)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </div>
              ) : (
                <>
                  <span>{r.name}</span>
                  <Button
                    variant="outline"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(r.id)}
                  >
                    Restore
                  </Button>
                </>
              )}
            </li>
          ))}
          {records.data?.length === 0 && (
            <li>No {history ? "history" : "archived records"} found.</li>
          )}
        </ul>
      )}
      <Pagination
        page={page}
        count={records.data?.length ?? 0}
        pageSize={50}
        onChange={setPage}
      />
    </div>
  );
}
