"use client";

import { refreshFastApiToken } from "@/lib/auth-token";
import { useAuthStore } from "@/stores/auth-store";
import type { CustomReportRequest } from "@/types/api";

type ExportFormat = "csv" | "pdf" | "xlsx";
type ExportParamValue = string | number | boolean | null | undefined;
export type ExportParams = Record<string, ExportParamValue>;

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

function appendParam(url: URL, key: string, value: ExportParamValue): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  url.searchParams.set(key, String(value));
}

function exportUrl(format: ExportFormat, report: string, params: ExportParams): string {
  const url = new URL(`${API_BASE_URL.replace(/\/+$/, "")}/reports/export/${format}`, window.location.origin);
  url.searchParams.set("report", report);
  Object.entries(params).forEach(([key, value]) => appendParam(url, key, value));
  return url.toString();
}

async function resolveToken(): Promise<string | null> {
  const existingToken = useAuthStore.getState().accessToken;
  if (existingToken) {
    return existingToken;
  }

  try {
    return await refreshFastApiToken();
  } catch {
    return null;
  }
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) {
    return fallback;
  }

  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? fallback;
}

async function authHeaders(): Promise<Headers> {
  const token = await resolveToken();
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

async function downloadResponse(response: Response, fallbackFilename: string): Promise<void> {
  if (!response.ok) {
    throw new Error("Could not export report.");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filenameFromDisposition(response.headers.get("content-disposition"), fallbackFilename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export async function downloadReport(format: ExportFormat, report: string, params: ExportParams = {}): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(exportUrl(format, report, params), { headers });

  await downloadResponse(response, `${report}.${format}`);
}

export async function downloadCustomReportXlsx(request: CustomReportRequest): Promise<void> {
  const headers = await authHeaders();
  headers.set("Accept", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/reports/custom/export/xlsx`, {
    body: JSON.stringify(request),
    headers,
    method: "POST",
  });

  await downloadResponse(response, `${request.entity}-custom-report.xlsx`);
}
