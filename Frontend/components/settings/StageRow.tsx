"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Trash2 } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Deal, PipelineStage, PipelineStageUpdate } from "@/types/api";

interface StageRowProps {
  canEdit?: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  pipelineId: string;
  stage: PipelineStage;
}

export function StageRow({
  canEdit = true,
  dragHandleProps,
  pipelineId,
  stage,
}: StageRowProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(stage.name);
  const [probability, setProbability] = useState(
    String(Math.round(stage.probability)),
  );
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    setName(stage.name);
    setProbability(String(Math.round(stage.probability)));
  }, [stage.name, stage.probability]);

  const usageQuery = useQuery({
    queryFn: () =>
      api.get<Deal[]>("/deals/", { page_size: 1, stage_id: stage.id }),
    queryKey: ["deals", "stage-usage", stage.id],
  });

  const updateStage = useMutation({
    mutationFn: (payload: PipelineStageUpdate) =>
      api.patch<PipelineStage, PipelineStageUpdate>(
        `/pipelines/${pipelineId}/stages/${stage.id}`,
        payload,
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });

  const deleteStage = useMutation({
    mutationFn: () =>
      api.delete<void>(`/pipelines/${pipelineId}/stages/${stage.id}`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });

  function saveIfChanged() {
    if (!canEdit) {
      return;
    }

    const nextProbability = Number(probability);
    if (
      !name.trim() ||
      Number.isNaN(nextProbability) ||
      nextProbability < 0 ||
      nextProbability > 100
    ) {
      setName(stage.name);
      setProbability(String(Math.round(stage.probability)));
      return;
    }

    const payload: PipelineStageUpdate = {};
    if (name.trim() !== stage.name) {
      payload.name = name.trim();
    }
    if (
      Math.round(nextProbability * 100) / 100 !==
      Math.round(stage.probability * 100) / 100
    ) {
      payload.probability = nextProbability;
    }

    if (Object.keys(payload).length > 0) {
      updateStage.mutate(payload);
    }
  }

  const hasDeals = (usageQuery.data ?? []).length > 0;
  const deleteDisabled =
    usageQuery.isLoading || hasDeals || deleteStage.isPending;

  return (
    <>
      <div className="grid min-w-0 gap-3 rounded-lg border border-slate-100 bg-white p-3 sm:grid-cols-[32px_minmax(0,1fr)_120px_44px] sm:items-center">
        <div className="flex items-center justify-between gap-3 sm:contents">
          <button
            aria-label="Drag stage"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-slate-100"
            disabled={!canEdit}
            type="button"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <Button
            className="sm:hidden"
            disabled={!canEdit || deleteDisabled}
            onClick={() => setConfirmDeleteOpen(true)}
            size="icon"
            title={
              hasDeals
                ? "Stage contains deals and cannot be deleted."
                : usageQuery.isLoading
                  ? "Checking stage usage..."
                  : "Delete stage"
            }
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
          </Button>
        </div>
        <Input
          aria-label="Stage name"
          disabled={!canEdit || updateStage.isPending}
          onBlur={saveIfChanged}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          value={name}
        />
        <div className="relative">
          <span className="sr-only">Probability percentage</span>
          <span className="mb-1 block text-xs font-medium text-[var(--muted-foreground)] sm:hidden">
            Probability
          </span>
          <div className="relative">
            <Input
              aria-label="Probability percentage"
              disabled={!canEdit || updateStage.isPending}
              max="100"
              min="0"
              onBlur={saveIfChanged}
              onChange={(event) => setProbability(event.target.value)}
              type="number"
              value={probability}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
              %
            </span>
          </div>
        </div>
        <Button
          className="hidden sm:inline-flex"
          disabled={!canEdit || deleteDisabled}
          onClick={() => setConfirmDeleteOpen(true)}
          size="icon"
          title={
            hasDeals
              ? "Stage contains deals and cannot be deleted."
              : usageQuery.isLoading
                ? "Checking stage usage..."
                : "Delete stage"
          }
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
        </Button>
      </div>
      <ConfirmDialog
        isPending={deleteStage.isPending}
        onConfirm={() =>
          deleteStage.mutate(undefined, {
            onSuccess: () => setConfirmDeleteOpen(false),
          })
        }
        onOpenChange={setConfirmDeleteOpen}
        open={confirmDeleteOpen}
        title="Delete stage"
      />
    </>
  );
}
