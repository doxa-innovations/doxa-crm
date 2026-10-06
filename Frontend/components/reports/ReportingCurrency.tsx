"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
export function ReportingCurrency() {
  const [currency, setCurrency] = useState("USD");
  const client = useQueryClient();
  useEffect(() => {
    const shared = new URLSearchParams(location.search).get("currency");
    const selected =
      shared && ["USD", "ETB", "EUR", "GBP"].includes(shared)
        ? shared
        : localStorage.getItem("doxa:report-currency") || "USD";
    setCurrency(selected);
    if (shared && shared === selected) {
      localStorage.setItem("doxa:report-currency", selected);
      void client.resetQueries();
    }
  }, [client]);
  return (
    <label className="flex flex-wrap items-center gap-3 text-sm">
      Reporting currency
      <select
        className="rounded border bg-white p-2"
        value={currency}
        onChange={(e) => {
          setCurrency(e.target.value);
          localStorage.setItem("doxa:report-currency", e.target.value);
          void client.resetQueries();
        }}
      >
        {["USD", "ETB", "EUR", "GBP"].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <span className="text-slate-600">
        Totals and exports include only this currency. No exchange-rate
        conversion.
      </span>
    </label>
  );
}
