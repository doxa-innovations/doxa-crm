"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { downloadReport, type ExportParams } from "@/lib/report-export";
import { cn } from "@/lib/utils";

interface ExportButtonsProps {
  params?: ExportParams;
  report: string;
}

export function ExportButtons({ params = {}, report }: ExportButtonsProps) {
  const [exporting, setExporting] = useState<"csv" | "pdf" | "xlsx" | null>(
    null,
  );

  async function runExport(format: "csv" | "pdf" | "xlsx") {
    setExporting(format);
    try {
      await downloadReport(format, report, params);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-sm">
      {(["csv", "pdf", "xlsx"] as const).map((format) => (
        <Button
          className={cn(
            "h-7 rounded px-2.5 text-xs text-[#475569] hover:bg-slate-50",
            exporting === format && "text-[var(--navy)]",
          )}
          disabled={exporting !== null}
          key={format}
          onClick={() => void runExport(format)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Download
            className={cn(
              "h-3.5 w-3.5",
              exporting === format && "animate-pulse",
            )}
            aria-hidden="true"
          />
          {exporting === format ? "Exporting" : format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
