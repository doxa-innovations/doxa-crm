"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

function readFilters<T extends object>(
  params: Pick<URLSearchParams, "get">,
  initial: T,
): T {
  const filters = { ...initial };
  for (const key of Object.keys(filters) as Array<keyof T>) {
    const value = params.get(String(key));
    if (value !== null)
      filters[key] = (
        typeof filters[key] === "boolean" ? value === "true" : value
      ) as T[keyof T];
  }
  return filters;
}
function readPage(params: Pick<URLSearchParams, "get">): number {
  const value = Number(params.get("page"));
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}
/** Initialize from the request URL so hydration cannot overwrite the user's first edit. */
export function useListState<T extends object>(initial: T) {
  const params = useSearchParams();
  const defaults = useRef(initial);
  const [filters, setFilters] = useState(() => readFilters(params, initial));
  const [page, setPage] = useState(() => readPage(params));
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(location.search);
      setFilters(readFilters(params, defaults.current));
      setPage(readPage(params));
    };
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(filters)) {
      if (value === "" || value === false || value == null)
        url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    if (page > 1) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    history.replaceState(
      history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }, [filters, page]);
  return { filters, setFilters, page, setPage };
}
