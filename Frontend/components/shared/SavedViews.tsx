"use client";
import { useState, useEffect } from "react";
import { usePreference } from "@/hooks/usePreference";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function SavedViews<T>({
  scope,
  value,
  onLoad,
  validateShared,
}: {
  scope: string;
  value: T;
  onLoad: (value: T) => void;
  validateShared?: (value: unknown) => T | null;
}) {
  const views = usePreference<Array<{ name: string; value: T }>>(
    `views-${scope}`,
    [],
  );
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  useEffect(() => {
    const encoded = new URLSearchParams(location.search).get(`${scope}-view`);
    if (!encoded || !validateShared) return;
    try {
      const parsed =
        encoded.length < 16000 ? validateShared(JSON.parse(encoded)) : null;
      if (!parsed) throw new Error();
      onLoad(parsed);
    } catch {
      setShareMessage(
        "This shared view is invalid. Build a new report or choose a saved view.",
      );
    }
  }, [scope]);
  return (
    <details className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        Saved views
      </summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          Saved views
          <select
            aria-label="Saved views"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const view = views.value.find((v) => v.name === e.target.value);
              if (view) onLoad(view.value);
            }}
            className="h-10 rounded border bg-white px-3"
          >
            <option value="">Choose a view</option>
            {views.value.map((v) => (
              <option key={v.name}>{v.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          View name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Qualified leads"
          />
        </label>
        <Button
          variant="outline"
          disabled={!name.trim() || views.isPending || views.isLoading}
          onClick={() => {
            views.save([
              ...views.value.filter((v) => v.name !== name.trim()),
              { name: name.trim(), value },
            ]);
            setSelected(name.trim());
          }}
        >
          Save view
        </Button>
        {selected && (
          <Button
            variant="ghost"
            disabled={views.isPending}
            onClick={() => {
              views.save(views.value.filter((v) => v.name !== selected));
              setSelected("");
            }}
          >
            Delete view
          </Button>
        )}
        {validateShared && (
          <Button
            variant="outline"
            onClick={async () => {
              const url = new URL(location.href);
              url.searchParams.set(`${scope}-view`, JSON.stringify(value));
              url.searchParams.set(
                "currency",
                localStorage.getItem("doxa:report-currency") || "USD",
              );
              try {
                await navigator.clipboard.writeText(url.toString());
                setShareMessage(
                  "Link copied. It contains filter values. Recipients must sign in and can only see records allowed by their role.",
                );
              } catch {
                setShareMessage(
                  "Clipboard access is unavailable. Save this view and try copying from a secure browser.",
                );
              }
            }}
          >
            Copy view link
          </Button>
        )}
        {shareMessage && (
          <p role="status" className="text-sm text-slate-600">
            {shareMessage}
          </p>
        )}
        {views.isError && (
          <p role="alert">
            Saved views could not be loaded or saved. Please retry.
          </p>
        )}
      </div>
    </details>
  );
}
