import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DataTableColumn<TData> {
  id: string;
  header: React.ReactNode;
  accessor?: keyof TData | ((row: TData) => React.ReactNode);
  cell?: (row: TData) => React.ReactNode;
  className?: string;
}

interface DataTablePagination {
  page: number;
  pageSize: number;
  total?: number;
  hasNextPage?: boolean;
  onPageChange: (page: number) => void;
}

interface DataTableProps<TData> {
  columns: Array<DataTableColumn<TData>>;
  data: TData[];
  emptyMessage?: string;
  getRowClassName?: (row: TData) => string | undefined;
  getRowKey: (row: TData) => string;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => unknown;
  pagination?: DataTablePagination;
}

function renderCell<TData>(
  column: DataTableColumn<TData>,
  row: TData,
): React.ReactNode {
  if (column.cell) {
    return column.cell(row);
  }

  if (typeof column.accessor === "function") {
    return column.accessor(row);
  }

  if (column.accessor) {
    const value = row[column.accessor];
    return value === null || value === undefined ? "" : String(value);
  }

  return "";
}

function paginationLabel(
  pagination: DataTablePagination,
  currentCount: number,
): string {
  const start =
    currentCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = (pagination.page - 1) * pagination.pageSize + currentCount;

  if (pagination.total !== undefined) {
    return `Showing ${start}-${Math.min(end, pagination.total)} of ${pagination.total}`;
  }

  return `Showing ${start}-${end}`;
}

export function DataTable<TData>({
  columns,
  data,
  emptyMessage = "No records found.",
  getRowClassName,
  getRowKey,
  isLoading = false,
  pagination,
  error,
  onRetry,
}: DataTableProps<TData>) {
  if (error)
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
      >
        Records could not be loaded.{" "}
        {onRetry && (
          <Button variant="outline" onClick={() => onRetry()}>
            Retry
          </Button>
        )}
      </div>
    );
  const loadingRows = Array.from(
    { length: pagination?.pageSize ? Math.min(pagination.pageSize, 8) : 8 },
    (_, index) => index,
  );
  const hasNextPage =
    pagination?.hasNextPage ??
    (pagination?.total !== undefined
      ? pagination.page * pagination.pageSize < pagination.total
      : false);
  const hasMultiplePages = Boolean(
    pagination &&
    (pagination.page > 1 ||
      hasNextPage ||
      (pagination.total !== undefined &&
        pagination.total > pagination.pageSize)),
  );

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-normal text-[var(--muted-foreground)]",
                    column.className,
                  )}
                  key={column.id}
                  scope="col"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading
              ? loadingRows.map((row) => (
                  <tr key={row}>
                    {columns.map((column) => (
                      <td className="px-4 py-4" key={column.id}>
                        <Skeleton className="h-4 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}

            {!isLoading && data.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]"
                  colSpan={columns.length}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : null}

            {!isLoading
              ? data.map((row) => (
                  <tr
                    className={cn(
                      "transition-colors hover:bg-[var(--background)]/70",
                      getRowClassName?.(row),
                    )}
                    key={getRowKey(row)}
                  >
                    {columns.map((column) => (
                      <td
                        className={cn(
                          "px-4 py-4 text-sm text-slate-700",
                          column.className,
                        )}
                        key={column.id}
                      >
                        {renderCell(column, row)}
                      </td>
                    ))}
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      {pagination && hasMultiplePages ? (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p className="text-sm text-[var(--muted-foreground)]">
            {paginationLabel(pagination, data.length)}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={pagination.page <= 1 || isLoading}
              onClick={() =>
                pagination.onPageChange(Math.max(1, pagination.page - 1))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={!hasNextPage || isLoading}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
