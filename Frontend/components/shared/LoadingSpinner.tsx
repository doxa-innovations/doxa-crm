import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  label?: string;
  className?: string;
}

export function LoadingSpinner({
  className,
  label = "Loading",
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        "flex min-h-48 flex-col items-center justify-center gap-3 text-[var(--muted-foreground)]",
        className,
      )}
    >
      <LoaderCircle
        className="h-6 w-6 animate-spin text-[var(--primary)]"
        aria-hidden="true"
      />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
