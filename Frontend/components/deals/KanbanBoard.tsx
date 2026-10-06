"use client";

import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { DealCard } from "@/components/deals/DealCard";
import { LostReasonModal } from "@/components/deals/LostReasonModal";
import { api } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  Deal,
  DealMoveStageRequest,
  DealSummary,
  KanbanStage,
} from "@/types/api";

interface KanbanBoardProps {
  canDrag?: boolean;
  detailsById?: Map<string, Deal>;
  stages: KanbanStage[];
}

interface PendingLostMove {
  dealId: string;
  nextColumns: KanbanStage[];
  previousColumns: KanbanStage[];
  stageId: string;
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function stageValue(stage: KanbanStage): number {
  return stage.deals.reduce((total, deal) => total + toNumber(deal.value), 0);
}

function isWonStage(stageName: string): boolean {
  return stageName.toLowerCase().includes("won");
}

function isLostStage(stageName: string): boolean {
  return stageName.toLowerCase().includes("lost");
}

function moveDeal(
  columns: KanbanStage[],
  sourceStageId: string,
  destinationStageId: string,
  sourceIndex: number,
  destinationIndex: number,
): KanbanStage[] {
  const nextColumns = columns.map((stage) => ({
    ...stage,
    deals: [...stage.deals],
  }));
  const sourceStage = nextColumns.find(
    (stage) => stage.stage_id === sourceStageId,
  );
  const destinationStage = nextColumns.find(
    (stage) => stage.stage_id === destinationStageId,
  );

  if (!sourceStage || !destinationStage) {
    return columns;
  }

  const [movedDeal] = sourceStage.deals.splice(sourceIndex, 1);
  if (!movedDeal) {
    return columns;
  }

  destinationStage.deals.splice(destinationIndex, 0, {
    ...movedDeal,
    stage_id: destinationStageId,
  });

  return nextColumns;
}

export function KanbanBoard({
  canDrag = true,
  detailsById,
  stages,
}: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const [columns, setColumns] = useState<KanbanStage[]>(stages);
  const [pendingLostMove, setPendingLostMove] =
    useState<PendingLostMove | null>(null);
  const stageById = useMemo(
    () => new Map(columns.map((stage) => [stage.stage_id, stage])),
    [columns],
  );

  useEffect(() => {
    setColumns(stages);
  }, [stages]);

  const moveStage = useMutation({
    mutationFn: ({
      dealId,
      lostReason,
      stageId,
    }: {
      dealId: string;
      lostReason?: string;
      stageId: string;
    }) =>
      api.post<Deal, DealMoveStageRequest>(`/deals/${dealId}/stage`, {
        lost_reason: lostReason,
        stage_id: stageId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function onDragEnd(result: DropResult) {
    if (!canDrag) {
      return;
    }

    const { destination, draggableId, source } = result;

    if (!destination) {
      return;
    }

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const previousColumns = columns;
    const nextColumns = moveDeal(
      columns,
      source.droppableId,
      destination.droppableId,
      source.index,
      destination.index,
    );
    const destinationStage = stageById.get(destination.droppableId);

    setColumns(nextColumns);

    if (destinationStage && isLostStage(destinationStage.name)) {
      setPendingLostMove({
        dealId: draggableId,
        nextColumns,
        previousColumns,
        stageId: destination.droppableId,
      });
      return;
    }

    moveStage.mutate(
      { dealId: draggableId, stageId: destination.droppableId },
      {
        onError: () => setColumns(previousColumns),
      },
    );
  }

  function cancelLostMove() {
    if (pendingLostMove) {
      setColumns(pendingLostMove.previousColumns);
    }
    setPendingLostMove(null);
  }

  function confirmLostMove(reason: string) {
    if (!pendingLostMove) {
      return;
    }

    setColumns(pendingLostMove.nextColumns);
    moveStage.mutate(
      {
        dealId: pendingLostMove.dealId,
        lostReason: reason,
        stageId: pendingLostMove.stageId,
      },
      {
        onError: () => setColumns(pendingLostMove.previousColumns),
        onSettled: () => setPendingLostMove(null),
      },
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((stage) => {
            const wonStage = isWonStage(stage.name);
            const lostStage = isLostStage(stage.name);

            return (
              <section
                className="flex min-h-[620px] w-80 shrink-0 flex-col rounded-xl bg-slate-100/80"
                key={stage.stage_id}
              >
                <header
                  className={cn(
                    "rounded-t-xl border-b border-slate-200 bg-white p-4",
                    wonStage && "border-emerald-200 bg-emerald-50",
                    lostStage && "border-red-200 bg-red-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2
                          className={cn(
                            "font-semibold text-[var(--navy)]",
                            wonStage && "text-emerald-800",
                            lostStage && "text-red-800",
                          )}
                        >
                          {stage.name}
                        </h2>
                        {wonStage && stage.deals.length > 0 ? (
                          <Sparkles
                            className="h-4 w-4 text-emerald-600"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {stage.deals.length} deals ·{" "}
                        {Array.from(new Set(stage.deals.map((d) => d.currency)))
                          .map((currency) =>
                            formatCurrency(
                              stage.deals
                                .filter((d) => d.currency === currency)
                                .reduce((sum, d) => sum + Number(d.value), 0),
                              currency,
                            ),
                          )
                          .join(" / ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)] ring-1 ring-slate-200">
                      {Math.round(stage.probability)}%
                    </span>
                  </div>
                  {wonStage && stage.deals.length > 0 ? (
                    <p className="mt-2 text-xs font-medium text-emerald-700">
                      Closed won
                    </p>
                  ) : null}
                </header>

                <Droppable
                  droppableId={stage.stage_id}
                  isDropDisabled={!canDrag}
                >
                  {(provided, snapshot) => (
                    <div
                      className={cn(
                        "flex flex-1 flex-col gap-3 p-3 transition-colors",
                        snapshot.isDraggingOver && "bg-blue-50",
                      )}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {stage.deals.map((deal: DealSummary, index) => (
                        <Draggable
                          disableInteractiveElementBlocking
                          draggableId={deal.id}
                          index={index}
                          isDragDisabled={!canDrag}
                          key={deal.id}
                        >
                          {(draggableProvided, draggableSnapshot) => {
                            const { style, ...draggableProps } =
                              draggableProvided.draggableProps;

                            return (
                              <div
                                ref={draggableProvided.innerRef}
                                style={style as CSSProperties | undefined}
                                {...draggableProps}
                                {...draggableProvided.dragHandleProps}
                              >
                                <DealCard
                                  deal={deal}
                                  detail={detailsById?.get(deal.id)}
                                  isDragging={draggableSnapshot.isDragging}
                                />
                              </div>
                            );
                          }}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </section>
            );
          })}
        </div>
      </DragDropContext>

      <LostReasonModal
        isPending={moveStage.isPending}
        onCancel={cancelLostMove}
        onConfirm={confirmLostMove}
        open={Boolean(pendingLostMove)}
      />
    </>
  );
}
