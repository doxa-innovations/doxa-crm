import { Button } from "@/components/ui/button";
export function Pagination({
  page,
  count,
  pageSize = 100,
  busy,
  onChange,
}: {
  page: number;
  count: number;
  pageSize?: number;
  busy?: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Results pages"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <Button
        variant="outline"
        disabled={page === 1 || busy}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <span className="text-sm text-slate-600">
        Page {page} · {count} results on this page
      </span>
      <Button
        variant="outline"
        disabled={count < pageSize || busy}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
