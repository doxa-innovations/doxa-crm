"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
export function usePreference<T>(key: string, fallback: T) {
  const userId = useAuthStore((s) => s.user?.id);
  const client = useQueryClient();
  const queryKey = ["preferences", userId, key];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api.get<{ value: T | null }>(`/workspace/preferences/${key}`),
    enabled: !!userId,
  });
  const save = useMutation({
    mutationFn: (value: T) =>
      api.put<{ value: T }>(`/workspace/preferences/${key}`, { value }),
    onSuccess: (data) => client.setQueryData(queryKey, data),
  });
  return {
    value: query.data?.value ?? fallback,
    save: save.mutate,
    isPending: save.isPending,
    isLoading: query.isLoading,
    isError: query.isError || save.isError,
    error: save.error ?? query.error,
  };
}
