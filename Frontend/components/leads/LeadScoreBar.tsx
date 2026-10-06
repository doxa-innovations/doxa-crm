import { cn } from "@/lib/utils";

interface LeadScoreBarProps {
  score: number;
  className?: string;
}

function scoreTone(score: number): string {
  if (score > 70) {
    return "bg-emerald-500";
  }

  if (score >= 40) {
    return "bg-amber-500";
  }

  return "bg-red-500";
}

export function LeadScoreBar({ className, score }: LeadScoreBarProps) {
  const normalizedScore = Math.max(0, Math.min(100, score));

  return (
    <div className={cn("min-w-32", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              scoreTone(normalizedScore),
            )}
            style={{ width: `${normalizedScore}%` }}
          />
        </div>
        <span className="w-8 text-right text-xs font-semibold text-[var(--navy)]">
          {normalizedScore}
        </span>
      </div>
    </div>
  );
}
