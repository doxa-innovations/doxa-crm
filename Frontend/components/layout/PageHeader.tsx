"use client";

import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PageHeaderAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  primaryAction?: PageHeaderAction;
}

export function PageHeader({
  primaryAction,
  subtitle,
  title,
}: PageHeaderProps) {
  const ActionIcon = primaryAction?.icon;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {primaryAction ? (
        <Button
          className="shrink-0 bg-[var(--primary)] hover:bg-blue-700"
          type="button"
          onClick={primaryAction.onClick}
        >
          {ActionIcon ? (
            <ActionIcon className="h-4 w-4" aria-hidden="true" />
          ) : null}
          {primaryAction.label}
        </Button>
      ) : null}
    </div>
  );
}
