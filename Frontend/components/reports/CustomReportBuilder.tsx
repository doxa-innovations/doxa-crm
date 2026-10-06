"use client";
import { z } from "zod";
import { RelationFilter } from "@/components/reports/RelationFilter";
import { SavedViews } from "@/components/shared/SavedViews";

import { useMutation } from "@tanstack/react-query";
import {
  Download,
  Filter,
  ListChecks,
  Play,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ReportCard } from "@/components/reports/ReportCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, apiErrorDetail } from "@/lib/api";
import { downloadCustomReportXlsx } from "@/lib/report-export";
import { cn } from "@/lib/utils";
import type {
  CustomReportEntity,
  CustomReportOperator,
  CustomReportRequest,
  CustomReportResponse,
} from "@/types/api";

type FieldType = "text" | "number" | "date" | "datetime" | "enum" | "uuid";

interface FieldOption {
  defaultSelected?: boolean;
  groupable?: boolean;
  id: string;
  label: string;
  sortable?: boolean;
  type: FieldType;
}

interface EntityConfig {
  defaultSort: string;
  fields: FieldOption[];
  label: string;
}

interface BuilderFilter {
  field: string;
  id: string;
  operator: CustomReportOperator;
  value: string;
}

const selectClassName =
  "h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
const dateInputClassName =
  "[color-scheme:light] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100";

const ENTITY_CONFIG: Record<CustomReportEntity, EntityConfig> = {
  activities: {
    defaultSort: "created_at",
    fields: [
      { id: "id", label: "Activity ID", type: "uuid" },
      {
        defaultSelected: true,
        groupable: true,
        id: "type",
        label: "Type",
        type: "enum",
      },
      { defaultSelected: true, id: "subject", label: "Subject", type: "text" },
      {
        defaultSelected: true,
        groupable: true,
        id: "owner_id",
        label: "Owner",
        type: "uuid",
      },
      { groupable: true, id: "lead_id", label: "Lead", type: "uuid" },
      { groupable: true, id: "contact_id", label: "Contact", type: "uuid" },
      { groupable: true, id: "deal_id", label: "Deal", type: "uuid" },
      { groupable: true, id: "account_id", label: "Account", type: "uuid" },
      {
        groupable: true,
        id: "scheduled_at",
        label: "Scheduled At",
        type: "datetime",
      },
      {
        groupable: true,
        id: "completed_at",
        label: "Completed At",
        type: "datetime",
      },
      {
        defaultSelected: true,
        groupable: true,
        id: "created_at",
        label: "Created At",
        type: "datetime",
      },
    ],
    label: "Activities",
  },
  contacts: {
    defaultSort: "created_at",
    fields: [
      { id: "id", label: "Contact ID", type: "uuid" },
      {
        defaultSelected: true,
        id: "first_name",
        label: "First Name",
        type: "text",
      },
      {
        defaultSelected: true,
        id: "last_name",
        label: "Last Name",
        type: "text",
      },
      { defaultSelected: true, id: "email", label: "Email", type: "text" },
      { defaultSelected: true, id: "phone", label: "Phone", type: "text" },
      {
        defaultSelected: true,
        groupable: true,
        id: "title",
        label: "Title",
        type: "text",
      },
      {
        defaultSelected: true,
        groupable: true,
        id: "account_id",
        label: "Account",
        type: "uuid",
      },
      { groupable: true, id: "owner_id", label: "Owner", type: "uuid" },
      {
        groupable: true,
        id: "created_at",
        label: "Created At",
        type: "datetime",
      },
    ],
    label: "Contacts",
  },
  deals: {
    defaultSort: "expected_close",
    fields: [
      { id: "id", label: "Deal ID", type: "uuid" },
      { defaultSelected: true, id: "title", label: "Title", type: "text" },
      { groupable: true, id: "type", label: "Type", type: "text" },
      { defaultSelected: true, id: "value", label: "Value", type: "number" },
      {
        defaultSelected: true,
        groupable: true,
        id: "currency",
        label: "Currency",
        type: "text",
      },
      {
        defaultSelected: true,
        groupable: true,
        id: "status",
        label: "Status",
        type: "enum",
      },
      {
        defaultSelected: true,
        groupable: true,
        id: "expected_close",
        label: "Expected Close",
        type: "date",
      },
      {
        defaultSelected: true,
        groupable: true,
        id: "owner_id",
        label: "Owner",
        type: "uuid",
      },
      { groupable: true, id: "pipeline_id", label: "Pipeline", type: "uuid" },
      { groupable: true, id: "stage_id", label: "Stage", type: "uuid" },
      { groupable: true, id: "account_id", label: "Account", type: "uuid" },
      {
        groupable: true,
        id: "created_at",
        label: "Created At",
        type: "datetime",
      },
    ],
    label: "Deals",
  },
  leads: {
    defaultSort: "created_at",
    fields: [
      { id: "id", label: "Lead ID", type: "uuid" },
      {
        defaultSelected: true,
        id: "full_name",
        label: "Full Name",
        type: "text",
      },
      { defaultSelected: true, id: "email", label: "Email", type: "text" },
      { defaultSelected: true, id: "company", label: "Company", type: "text" },
      {
        defaultSelected: true,
        groupable: true,
        id: "source",
        label: "Source",
        type: "enum",
      },
      {
        defaultSelected: true,
        groupable: true,
        id: "status",
        label: "Status",
        type: "enum",
      },
      { defaultSelected: true, id: "score", label: "Score", type: "number" },
      {
        groupable: true,
        id: "assigned_to",
        label: "Assigned To",
        type: "uuid",
      },
      { groupable: true, id: "campaign_id", label: "Campaign", type: "uuid" },
      {
        groupable: true,
        id: "created_at",
        label: "Created At",
        type: "datetime",
      },
      {
        groupable: true,
        id: "converted_at",
        label: "Converted At",
        type: "datetime",
      },
    ],
    label: "Leads",
  },
};

const OPERATOR_LABELS: Record<CustomReportOperator, string> = {
  contains: "contains",
  eq: "equals",
  gt: "greater than",
  gte: "greater or equal",
  in: "is one of",
  lt: "less than",
  lte: "less or equal",
  ne: "not equal",
};

const DATE_OPERATORS: CustomReportOperator[] = [
  "gte",
  "lte",
  "eq",
  "gt",
  "lt",
  "ne",
];
const EXACT_OPERATORS: CustomReportOperator[] = ["eq", "ne"];
const NUMBER_OPERATORS: CustomReportOperator[] = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
];
const TEXT_OPERATORS: CustomReportOperator[] = ["contains", "eq", "ne"];

for (const [entity, config] of Object.entries(ENTITY_CONFIG)) {
  const owner = config.fields.find(
    (field) => field.id === "owner_id" || field.id === "assigned_to",
  );
  if (owner) {
    const selected = owner.defaultSelected;
    owner.defaultSelected = false;
    owner.label = "Owner ID";
    config.fields.push({
      id: "owner_name",
      label: "Owner name",
      type: "text",
      groupable: true,
      defaultSelected: selected,
    });
  }
  const account = config.fields.find((field) => field.id === "account_id");
  if (account) {
    const selected = account.defaultSelected;
    account.defaultSelected = false;
    account.label = "Account ID";
    config.fields.push({
      id: "account_name",
      label: "Account name",
      type: "text",
      groupable: true,
      defaultSelected: selected,
    });
  }
}

const reportViewSchema = z
  .object({
    entity: z.enum(["deals", "leads", "contacts", "activities"]),
    filters: z
      .array(
        z.object({
          id: z.string().max(80),
          field: z.string(),
          operator: z.enum([
            "eq",
            "ne",
            "gt",
            "gte",
            "lt",
            "lte",
            "contains",
            "in",
          ]),
          value: z.string().max(2000),
        }),
      )
      .max(30),
    groupBy: z.string(),
    selectedFields: z.array(z.string()).max(20),
    sortBy: z.string(),
    sortDir: z.enum(["asc", "desc"]),
    dateField: z.string(),
    dateFrom: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    dateTo: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  })
  .refine((view) => {
    const names = new Set(
      ENTITY_CONFIG[view.entity].fields.map((field) => field.id),
    );
    return (
      view.selectedFields.every((field) => names.has(field)) &&
      view.filters.every((filter) => names.has(filter.field)) &&
      (!view.sortBy || names.has(view.sortBy)) &&
      (!view.groupBy || names.has(view.groupBy)) &&
      (!view.dateField || names.has(view.dateField))
    );
  });

function defaultFields(config: EntityConfig): string[] {
  return config.fields
    .filter((field) => field.defaultSelected)
    .map((field) => field.id);
}

function firstDateField(config: EntityConfig): string {
  return (
    config.fields.find(
      (field) => field.type === "date" || field.type === "datetime",
    )?.id ?? ""
  );
}

function createFilterId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function operatorOptionsFor(field: FieldOption): CustomReportOperator[] {
  if (field.type === "number") {
    return NUMBER_OPERATORS;
  }

  if (field.type === "date" || field.type === "datetime") {
    return DATE_OPERATORS;
  }

  if (field.type === "enum" || field.type === "uuid") {
    return EXACT_OPERATORS;
  }

  return TEXT_OPERATORS;
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const raw = String(value);
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }

  return raw;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  return String(value);
}

export function CustomReportBuilder() {
  const [entity, setEntity] = useState<CustomReportEntity>("deals");
  const [filters, setFilters] = useState<BuilderFilter[]>([]);
  const [groupBy, setGroupBy] = useState("");
  const [result, setResult] = useState<CustomReportResponse | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>(() =>
    defaultFields(ENTITY_CONFIG.deals),
  );
  const [sortBy, setSortBy] = useState(ENTITY_CONFIG.deals.defaultSort);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dateField, setDateField] = useState(() =>
    firstDateField(ENTITY_CONFIG.deals),
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [lastRequest, setLastRequest] = useState<CustomReportRequest | null>(
    null,
  );

  const currentConfig = ENTITY_CONFIG[entity];
  const selectedFieldSet = useMemo(
    () => new Set(selectedFields),
    [selectedFields],
  );
  const dateFields = currentConfig.fields.filter(
    (field) => field.type === "date" || field.type === "datetime",
  );
  const groupableFields = currentConfig.fields.filter(
    (field) => field.groupable,
  );
  const sortableFields = currentConfig.fields.filter(
    (field) => field.sortable !== false,
  );
  const resultColumns = result?.columns ?? [];
  const resultRows = result?.rows ?? [];

  const reportMutation = useMutation({
    mutationFn: (payload: CustomReportRequest) =>
      api.post<CustomReportResponse, CustomReportRequest>(
        "/reports/custom",
        payload,
      ),
    onSuccess: (data, variables) => {
      setExportError("");
      setLastRequest(variables);
      setResult(data);
    },
  });

  function fieldOption(fieldId: string): FieldOption {
    return (
      currentConfig.fields.find((field) => field.id === fieldId) ??
      currentConfig.fields[0]
    );
  }

  function columnLabel(column: string): string {
    if (column === "count") {
      return "Count";
    }

    return (
      currentConfig.fields.find((field) => field.id === column)?.label ?? column
    );
  }

  function updateEntity(nextEntity: CustomReportEntity) {
    const nextConfig = ENTITY_CONFIG[nextEntity];
    setEntity(nextEntity);
    setSelectedFields(defaultFields(nextConfig));
    setFilters([]);
    setGroupBy("");
    setSortBy(nextConfig.defaultSort);
    setSortDir("asc");
    setDateField(firstDateField(nextConfig));
    setDateFrom("");
    setDateTo("");
    setExportError("");
    setLastRequest(null);
    setResult(null);
  }

  function toggleField(fieldId: string) {
    setSelectedFields((current) => {
      if (current.includes(fieldId)) {
        return current.filter((selectedField) => selectedField !== fieldId);
      }

      return [...current, fieldId];
    });
  }

  function addFilter() {
    const firstField = currentConfig.fields[0];
    setFilters((current) => [
      ...current,
      {
        field: firstField.id,
        id: createFilterId(),
        operator: operatorOptionsFor(firstField)[0],
        value: "",
      },
    ]);
  }

  function updateFilter(filterId: string, update: Partial<BuilderFilter>) {
    setFilters((current) =>
      current.map((filter) => {
        if (filter.id !== filterId) {
          return filter;
        }

        const nextFilter = { ...filter, ...update };
        if (update.field) {
          const nextField = fieldOption(update.field);
          const nextOperators = operatorOptionsFor(nextField);
          nextFilter.operator = nextOperators.includes(nextFilter.operator)
            ? nextFilter.operator
            : nextOperators[0];
        }

        return nextFilter;
      }),
    );
  }

  function removeFilter(filterId: string) {
    setFilters((current) => current.filter((filter) => filter.id !== filterId));
  }

  function coerceFilterValue(filter: BuilderFilter): unknown {
    const field = fieldOption(filter.field);
    const trimmedValue = filter.value.trim();

    if (filter.operator === "in") {
      return trimmedValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }

    if (field.type === "number") {
      const numericValue = Number(trimmedValue);
      return Number.isFinite(numericValue) ? numericValue : trimmedValue;
    }

    return trimmedValue;
  }

  function buildRequest(): CustomReportRequest {
    const hasDateRange = Boolean(dateField && (dateFrom || dateTo));
    const requestFields = groupBy ? [groupBy] : selectedFields;

    return {
      date_range: hasDateRange
        ? {
            field: dateField,
            from: dateFrom || null,
            to: dateTo || null,
          }
        : null,
      entity,
      fields: requestFields,
      filters: filters
        .filter((filter) => filter.field && filter.value.trim())
        .map((filter) => ({
          field: filter.field,
          operator: filter.operator,
          value: coerceFilterValue(filter),
        })),
      group_by: groupBy || null,
      sort_by: groupBy || sortBy || null,
      sort_dir: sortDir,
    };
  }

  function runReport() {
    setExportError("");
    reportMutation.mutate(buildRequest());
  }

  function downloadCsv() {
    if (!result) {
      return;
    }

    const csvRows = [
      result.columns.map((column) => csvValue(columnLabel(column))).join(","),
      ...result.rows.map((row) => row.map(csvValue).join(",")),
    ];
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${entity}-custom-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadXlsx() {
    if (!lastRequest) {
      return;
    }

    setExportError("");
    setExportingXlsx(true);
    try {
      await downloadCustomReportXlsx(lastRequest);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Could not export XLSX.",
      );
    } finally {
      setExportingXlsx(false);
    }
  }

  const canRun = groupBy || selectedFields.length > 0;
  const errorText = reportMutation.isError
    ? apiErrorDetail(reportMutation.error, "Could not run custom report.")
    : exportError;

  return (
    <div className="grid gap-6">
      <SavedViews
        scope="reports"
        validateShared={(value) => {
          const parsed = reportViewSchema.safeParse(value);
          return parsed.success ? parsed.data : null;
        }}
        value={{
          entity,
          filters,
          groupBy,
          selectedFields,
          sortBy,
          sortDir,
          dateField,
          dateFrom,
          dateTo,
        }}
        onLoad={(view) => {
          setEntity(view.entity);
          setFilters(view.filters);
          setGroupBy(view.groupBy);
          setSelectedFields(view.selectedFields);
          setSortBy(view.sortBy);
          setSortDir(view.sortDir);
          setDateField(view.dateField);
          setDateFrom(view.dateFrom);
          setDateTo(view.dateTo);
          setResult(null);
          setLastRequest(null);
        }}
      />
      <section className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Custom Report Builder
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Build reusable reports from CRM records. Deal reports use the
              reporting currency selected above.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!result}
              onClick={downloadCsv}
              type="button"
              variant="outline"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </Button>
            <Button
              disabled={!lastRequest || exportingXlsx}
              onClick={() => void downloadXlsx()}
              type="button"
              variant="outline"
            >
              <Download
                className={cn("h-4 w-4", exportingXlsx && "animate-pulse")}
                aria-hidden="true"
              />
              {exportingXlsx ? "Exporting" : "Export XLSX"}
            </Button>
            <Button
              disabled={!canRun || reportMutation.isPending}
              onClick={runReport}
              type="button"
            >
              <Play
                className={cn(
                  "h-4 w-4",
                  reportMutation.isPending && "animate-pulse",
                )}
                aria-hidden="true"
              />
              {reportMutation.isPending ? "Running" : "Run Report"}
            </Button>
          </div>
        </div>

        {errorText ? (
          <div
            className="mt-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {errorText}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5">
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--navy)]"
                htmlFor="custom-report-entity"
              >
                Record type
              </label>
              <select
                className={selectClassName}
                id="custom-report-entity"
                onChange={(event) =>
                  updateEntity(event.target.value as CustomReportEntity)
                }
                value={entity}
              >
                {(Object.keys(ENTITY_CONFIG) as CustomReportEntity[]).map(
                  (entityKey) => (
                    <option key={entityKey} value={entityKey}>
                      {ENTITY_CONFIG[entityKey].label}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--navy)]"
                htmlFor="custom-report-group"
              >
                Group by
              </label>
              <select
                className={selectClassName}
                id="custom-report-group"
                onChange={(event) => setGroupBy(event.target.value)}
                value={groupBy}
              >
                <option value="">No grouping</option>
                {groupableFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--navy)]"
                htmlFor="custom-report-sort"
              >
                Sort by
              </label>
              <select
                className={selectClassName}
                disabled={Boolean(groupBy)}
                id="custom-report-sort"
                onChange={(event) => setSortBy(event.target.value)}
                value={groupBy || sortBy}
              >
                {sortableFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--navy)]"
                htmlFor="custom-report-sort-dir"
              >
                Direction
              </label>
              <select
                className={selectClassName}
                id="custom-report-sort-dir"
                onChange={(event) =>
                  setSortDir(event.target.value as "asc" | "desc")
                }
                value={sortDir}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-3">
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--navy)]"
                htmlFor="custom-report-date-field"
              >
                Date field
              </label>
              <select
                className={selectClassName}
                id="custom-report-date-field"
                onChange={(event) => setDateField(event.target.value)}
                value={dateField}
              >
                {dateFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--navy)]"
                htmlFor="custom-report-date-from"
              >
                From
              </label>
              <Input
                className={dateInputClassName}
                id="custom-report-date-from"
                onChange={(event) => setDateFrom(event.target.value)}
                type="date"
                value={dateFrom}
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--navy)]"
                htmlFor="custom-report-date-to"
              >
                To
              </label>
              <Input
                className={dateInputClassName}
                id="custom-report-date-to"
                onChange={(event) => setDateTo(event.target.value)}
                type="date"
                value={dateTo}
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--navy)]">
              <ListChecks
                className="h-4 w-4 text-[var(--primary)]"
                aria-hidden="true"
              />
              Fields
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {currentConfig.fields.map((field) => {
                const checked = selectedFieldSet.has(field.id);

                return (
                  <label
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition",
                      checked
                        ? "border-[var(--navy)] bg-slate-50 text-[var(--navy)]"
                        : "border-slate-200 text-[var(--muted-foreground)] hover:bg-slate-50",
                    )}
                    key={field.id}
                  >
                    <input
                      checked={checked}
                      className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
                      onChange={() => toggleField(field.id)}
                      type="checkbox"
                    />
                    <span className="min-w-0 truncate">{field.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--navy)]">
                <Filter
                  className="h-4 w-4 text-[var(--primary)]"
                  aria-hidden="true"
                />
                Filters
              </div>
              <Button
                onClick={addFilter}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Filter
              </Button>
            </div>

            {filters.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-[var(--muted-foreground)]">
                No filters applied.
              </div>
            ) : (
              <div className="grid gap-3">
                {filters.map((filter) => {
                  const selectedField = fieldOption(filter.field);
                  const operators = operatorOptionsFor(selectedField);

                  return (
                    <div
                      className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_auto]"
                      key={filter.id}
                    >
                      <select
                        aria-label="Filter field"
                        className={selectClassName}
                        onChange={(event) =>
                          updateFilter(filter.id, { field: event.target.value })
                        }
                        value={filter.field}
                      >
                        {currentConfig.fields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Filter operator"
                        className={selectClassName}
                        onChange={(event) =>
                          updateFilter(filter.id, {
                            operator: event.target
                              .value as CustomReportOperator,
                          })
                        }
                        value={filter.operator}
                      >
                        {operators.map((operator) => (
                          <option key={operator} value={operator}>
                            {OPERATOR_LABELS[operator]}
                          </option>
                        ))}
                      </select>
                      {selectedField.type === "uuid" &&
                      filter.field !== "id" &&
                      filter.operator !== "in" ? (
                        <RelationFilter
                          field={filter.field}
                          value={filter.value}
                          onChange={(value) =>
                            updateFilter(filter.id, { value })
                          }
                        />
                      ) : (
                        <Input
                          aria-label="Filter value"
                          onChange={(event) =>
                            updateFilter(filter.id, {
                              value: event.target.value,
                            })
                          }
                          placeholder="Value"
                          type={
                            selectedField.type === "date" ||
                            selectedField.type === "datetime"
                              ? "date"
                              : selectedField.type === "number"
                                ? "number"
                                : "text"
                          }
                          value={filter.value}
                        />
                      )}
                      <Button
                        aria-label="Remove filter"
                        onClick={() => removeFilter(filter.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <ReportCard
        description={
          result
            ? `${result.total.toLocaleString()} rows returned`
            : "Run a report to populate the table."
        }
        empty={!result || resultRows.length === 0}
        noDataText={
          result
            ? "No rows matched this report."
            : "No custom report has been run yet."
        }
        title="Custom Report Results"
      >
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-[var(--navy)]">
            <Table2
              className="h-4 w-4 text-[var(--primary)]"
              aria-hidden="true"
            />
            {currentConfig.label}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-white">
                <tr>
                  {resultColumns.map((column) => (
                    <th
                      className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--navy)]"
                      key={column}
                      scope="col"
                    >
                      {columnLabel(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {resultRows.map((row, rowIndex) => (
                  <tr
                    className="hover:bg-slate-50"
                    key={`${rowIndex}-${row.join("-")}`}
                  >
                    {row.map((value, columnIndex) => (
                      <td
                        className="max-w-[260px] truncate px-4 py-3 text-[#334155]"
                        key={`${resultColumns[columnIndex]}-${columnIndex}`}
                      >
                        {formatCell(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ReportCard>
    </div>
  );
}
