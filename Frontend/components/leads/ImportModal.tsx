"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseCsv } from "@/lib/csv";
import { api, apiErrorDetail } from "@/lib/api";
import type { LeadImportSummary } from "@/types/api";

interface ImportModalProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const templateCsv =
  "full_name,email,phone,company,source\nAda Lovelace,ada@acme.com,+15555550123,Acme,website\n";

export function ImportModal({ onOpenChange, open }: ImportModalProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LeadImportSummary | null>(null);

  const templateHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`,
    [],
  );
  const importMutation = useMutation({
    mutationFn: (csvFile: File) => {
      const formData = new FormData();
      formData.append("file", csvFile);
      return api.postForm<LeadImportSummary>("/leads/import", formData);
    },
    onSuccess: (result) => {
      setSummary(result);
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function resetState() {
    setFile(null);
    setPreview([]);
    setError(null);
    setSummary(null);
    importMutation.reset();
  }

  async function selectFile(nextFile: File | undefined) {
    setError(null);
    setSummary(null);
    setFile(null);
    setPreview([]);

    if (!nextFile) {
      return;
    }

    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setError("Upload a .csv file.");
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      setError("CSV must be 5MB or smaller.");
      return;
    }

    try {
      const text = await nextFile.text();
      const rows = parseCsv(text);
      setPreview(rows.slice(0, 6));
      setFile(nextFile);
    } catch (error) {
      setError(apiErrorDetail(error, "Could not read CSV."));
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          resetState();
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            Upload a CSV with full_name, email, phone, company, and source
            columns.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <a
            className={buttonVariants({
              className: "w-fit",
              variant: "outline",
            })}
            download="lead-import-template.csv"
            href={templateHref}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download CSV template
          </a>

          <div
            className="rounded-xl border border-dashed border-slate-300 bg-[var(--background)]/50 p-8 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void selectFile(event.dataTransfer.files[0]);
            }}
          >
            <UploadCloud
              className="mx-auto h-10 w-10 text-[var(--primary)]"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-[var(--navy)]">
              {file ? file.name : "Drag CSV here or choose a file"}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Maximum size 5MB.
            </p>
            <Button
              className="mt-4"
              onClick={() => inputRef.current?.click()}
              type="button"
              variant="outline"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Choose CSV
            </Button>
            <input
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void selectFile(event.target.files?.[0])}
              ref={inputRef}
              type="file"
            />
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </div>
          ) : null}

          {preview.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-[var(--navy)]">
                Preview
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((row, rowIndex) => (
                      <tr
                        className={
                          rowIndex === 0
                            ? "bg-slate-50 font-semibold text-[var(--navy)]"
                            : "text-slate-700"
                        }
                        key={`${row.join("-")}-${rowIndex}`}
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            className="px-3 py-2"
                            key={`${cell}-${cellIndex}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {importMutation.isPending ? (
            <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-[var(--primary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Importing leads...
            </div>
          ) : null}

          {summary ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Import complete
              </div>
              <p className="mt-2 text-sm text-emerald-800">
                Imported {summary.imported}, skipped {summary.skipped}.
              </p>
              {summary.errors.length > 0 ? (
                <ul className="mt-3 grid gap-1 text-sm text-emerald-900">
                  {summary.errors.map((item) => (
                    <li key={`${item.row}-${item.reason}`}>
                      Row {item.row}: {item.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {importMutation.isError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {apiErrorDetail(
                importMutation.error,
                "Import failed. Retry with the same file.",
              )}
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Close
            </Button>
            <Button
              className="bg-[var(--primary)] hover:bg-blue-700"
              disabled={!file || importMutation.isPending || Boolean(summary)}
              onClick={() => file && importMutation.mutate(file)}
              type="button"
            >
              Import CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
