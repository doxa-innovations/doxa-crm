"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useRecordOptions,
  RecordOptionsStatus,
} from "@/hooks/useRecordOptions";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
type Row = {
  stages?: Row[];
  id: string;
  name?: string;
  full_name?: string;
  title?: string;
  first_name?: string;
  last_name?: string;
};
export function RelationFilter({
  field,
  value,
  onChange,
}: {
  field: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const isUser = field === "owner_id" || field === "assigned_to";
  const path =
    field === "stage_id"
      ? "/pipelines/"
      : isUser
        ? "/users/directory"
        : `/${field.replace(/_id$/, "")}s/`;
  const list = useRecordOptions<Row>(path, { search: search || undefined }, [
    "report-options",
    field,
    search,
  ]);
  const records = (
    field === "stage_id"
      ? (list.data ?? []).flatMap((p) => p.stages ?? [])
      : (list.data ?? [])
  ).filter((r) =>
    (
      r.name ||
      r.full_name ||
      r.title ||
      `${r.first_name ?? ""} ${r.last_name ?? ""}`
    )
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="grid gap-2">
      <Input
        aria-label="Search related records"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Find a record by name"
      />
      <select
        aria-label="Related record"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border p-2"
      >
        <option value="">Choose record</option>
        {records.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name ||
              r.full_name ||
              r.title ||
              `${r.first_name} ${r.last_name}`}
          </option>
        ))}
      </select>
      <RecordOptionsStatus query={list} label="records" />
    </div>
  );
}
