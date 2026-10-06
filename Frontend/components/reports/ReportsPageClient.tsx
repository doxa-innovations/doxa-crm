"use client";
import { ReportingCurrency } from "@/components/reports/ReportingCurrency";

import {
  Activity,
  BarChart3,
  Handshake,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { useState, useEffect } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ActivityTab } from "@/components/reports/ActivityTab";
import { CustomReportBuilder } from "@/components/reports/CustomReportBuilder";
import { CustomersTab } from "@/components/reports/CustomersTab";
import { LeadsTab } from "@/components/reports/LeadsTab";
import { SalesTab } from "@/components/reports/SalesTab";
import { cn } from "@/lib/utils";

type ReportTab = "sales" | "leads" | "activity" | "customers" | "custom";

const tabs = [
  { icon: TrendingUp, id: "sales", label: "Sales" },
  { icon: BarChart3, id: "leads", label: "Leads" },
  { icon: Activity, id: "activity", label: "Activity" },
  { icon: Handshake, id: "customers", label: "Customers" },
  { icon: SlidersHorizontal, id: "custom", label: "Custom" },
] satisfies Array<{ icon: typeof TrendingUp; id: ReportTab; label: string }>;

export function ReportsPageClient() {
  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  useEffect(() => {
    if (new URLSearchParams(location.search).has("reports-view"))
      setActiveTab("custom");
  }, []);

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="Analyze pipeline, lead, activity, and customer performance. "
        title="Reports"
      />
      <ReportingCurrency />

      <section className="rounded-lg border border-slate-200/70 bg-white p-1.5 shadow-sm">
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;

            return (
              <button
                className={cn(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--navy)] text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:bg-slate-50 hover:text-[var(--navy)]",
                )}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === "sales" ? <SalesTab /> : null}
      {activeTab === "leads" ? <LeadsTab /> : null}
      {activeTab === "activity" ? <ActivityTab /> : null}
      {activeTab === "customers" ? <CustomersTab /> : null}
      {activeTab === "custom" ? <CustomReportBuilder /> : null}
    </div>
  );
}
