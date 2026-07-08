"use client";

import { refreshFastApiToken } from "@/lib/auth-token";
import { useAuthStore } from "@/stores/auth-store";
import type { ApiErrorPayload } from "@/types/api";

type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryPrimitive | readonly QueryPrimitive[]>;

interface ApiClientOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: HeadersInit;
  params?: QueryParams;
  skipAuth?: boolean;
}

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001"}/api/v1`;
const TOKEN_REFRESH_GRACE_SECONDS = 30;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function appendQueryParams(url: URL, params?: QueryParams): void {
  if (!params) {
    return;
  }

  Object.entries(params).forEach(([key, value]) => {
    if (isQueryPrimitiveArray(value)) {
      value.forEach((item) => appendQueryValue(url, key, item));
      return;
    }

    appendQueryValue(url, key, value);
  });
}

function isQueryPrimitiveArray(value: QueryPrimitive | readonly QueryPrimitive[]): value is readonly QueryPrimitive[] {
  return Array.isArray(value);
}

function appendQueryValue(url: URL, key: string, value: QueryPrimitive): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  url.searchParams.append(key, String(value));
}

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(`${normalizeBaseUrl(API_BASE_URL)}${normalizePath(path)}`);
  appendQueryParams(url, params);
  return url.toString();
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
}

function tokenExpiresSoon(token: string): boolean {
  const [, payload] = token.split(".");

  if (!payload) {
    return true;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as { exp?: unknown };
    if (typeof parsed.exp !== "number") {
      return true;
    }

    return parsed.exp <= Math.floor(Date.now() / 1000) + TOKEN_REFRESH_GRACE_SECONDS;
  } catch {
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") {
    return detail;
  }

  if (detail === undefined || detail === null) {
    return fallback;
  }

  try {
    return JSON.stringify(detail);
  } catch {
    return fallback;
  }
}

async function parseApiError(response: Response): Promise<ApiErrorPayload> {
  const fallbackDetail = response.statusText || "Request failed";
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return {
      code: `HTTP_${response.status}`,
      detail: text || fallbackDetail,
      status: response.status,
    };
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!isRecord(payload)) {
    return {
      code: `HTTP_${response.status}`,
      detail: fallbackDetail,
      status: response.status,
    };
  }

  return {
    code: typeof payload.code === "string" ? payload.code : `HTTP_${response.status}`,
    detail: stringifyDetail(payload.detail, fallbackDetail),
    status: response.status,
  };
}

async function resolveAuthToken(skipAuth?: boolean): Promise<string | null> {
  if (skipAuth) {
    return null;
  }

  const existingToken = useAuthStore.getState().accessToken;
  if (existingToken && !tokenExpiresSoon(existingToken)) {
    return existingToken;
  }

  try {
    return await refreshFastApiToken();
  } catch {
    useAuthStore.getState().clearAuth();
    return null;
  }
}

async function buildHeaders(options: ApiClientOptions): Promise<Headers> {
  const headers = new Headers(options.headers);
  const isFormData = options.body instanceof FormData;
  const token = await resolveAuthToken(options.skipAuth);

  if (!isFormData && options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

function requestBody(body: unknown): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (body instanceof FormData) {
    return body;
  }

  return JSON.stringify(body);
}

async function executeRequest<T>(path: string, options: ApiClientOptions): Promise<T> {
  const url = buildUrl(path, options.params);
  const response = await fetch(url, {
    ...options,
    body: requestBody(options.body),
    headers: await buildHeaders(options),
  });

  if (response.status === 401 && !options.skipAuth) {
    useAuthStore.getState().clearAuth();

    const refreshedToken = await resolveAuthToken(options.skipAuth);
    if (refreshedToken) {
      const retryHeaders = new Headers(options.headers);
      if (!(options.body instanceof FormData) && options.body !== undefined && !retryHeaders.has("Content-Type")) {
        retryHeaders.set("Content-Type", "application/json");
      }
      if (!retryHeaders.has("Accept")) {
        retryHeaders.set("Accept", "application/json");
      }
      retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);

      const retryResponse = await fetch(url, {
        ...options,
        body: requestBody(options.body),
        headers: retryHeaders,
      });

      if (retryResponse.ok) {
        if (retryResponse.status === 204) {
          return undefined as T;
        }

        const retryContentType = retryResponse.headers.get("content-type") ?? "";
        if (!retryContentType.includes("application/json")) {
          return (await retryResponse.text()) as T;
        }

        return (await retryResponse.json()) as T;
      }

      throw await parseApiError(retryResponse);
    }
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await response.text()) as T;
  }

  return (await response.json()) as T;
}

export async function apiClient<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  return executeRequest<T>(path, options);
}

export function apiErrorDetail(error: unknown, fallback = "Request failed"): string {
  if (typeof error === "object" && error !== null && "detail" in error) {
    const detail = (error as Partial<ApiErrorPayload>).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export const api = {
  delete: <T>(path: string, options: Omit<ApiClientOptions, "body" | "method"> = {}) =>
    apiClient<T>(path, { ...options, method: "DELETE" }),
  get: <T>(path: string, params?: QueryParams, options: Omit<ApiClientOptions, "body" | "method" | "params"> = {}) =>
    apiClient<T>(path, { ...options, method: "GET", params }),
  patch: <T, TBody = unknown>(
    path: string,
    body: TBody,
    options: Omit<ApiClientOptions, "body" | "method"> = {},
  ) => apiClient<T>(path, { ...options, body, method: "PATCH" }),
  post: <T, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<ApiClientOptions, "body" | "method"> = {},
  ) => apiClient<T>(path, { ...options, body, method: "POST" }),
  put: <T, TBody = unknown>(
    path: string,
    body: TBody,
    options: Omit<ApiClientOptions, "body" | "method"> = {},
  ) => apiClient<T>(path, { ...options, body, method: "PUT" }),
  postForm: <T>(path: string, formData: FormData, options: Omit<ApiClientOptions, "body" | "method"> = {}) =>
    apiClient<T>(path, { ...options, body: formData, method: "POST" }),
};
