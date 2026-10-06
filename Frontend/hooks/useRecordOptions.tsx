"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, type QueryParams } from "@/lib/api";
import { Button } from "@/components/ui/button";
export function useRecordOptions<T>(
  path: string,
  params: QueryParams,
  key: readonly unknown[],
) {
  const query = useInfiniteQuery({
    queryKey: [...key, "options"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<T[]>(path, { ...params, page: pageParam, page_size: 100 }),
    getNextPageParam: (last, pages) =>
      last.length === 100 ? pages.length + 1 : undefined,
  });
  return {
    ...query,
    data: query.data?.pages.flat(),
    loadMore: () => query.fetchNextPage(),
  };
}
export function RecordOptionsStatus({
  query,
  label,
}: {
  query: {
    isError: boolean;
    isFetching: boolean;
    hasNextPage: boolean;
    loadMore: () => unknown;
    refetch: () => unknown;
  };
  label: string;
}) {
  return query.isError ? (
    <p role="alert" className="text-sm text-red-700">
      Could not load {label}.{" "}
      <button
        type="button"
        className="underline"
        onClick={() => query.refetch()}
      >
        Retry
      </button>
    </p>
  ) : query.hasNextPage ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={query.isFetching}
      onClick={() => query.loadMore()}
    >
      Load more {label}
    </Button>
  ) : null;
}
