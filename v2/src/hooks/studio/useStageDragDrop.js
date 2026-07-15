"use client";

import { useCallback, useState } from "react";
import { moveStageByOffset, reorderStage } from "@/lib/roadbooks/stage-order";

export default function useStageDragDrop({ stages, setStages }) {
  const [draggingStageId, setDraggingStageId] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);

  const handleDragStart = useCallback((e, stageId) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(stageId));
    setDraggingStageId(stageId);
  }, []);

  const handleDragOver = useCallback((e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStageId(stageId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingStageId(null);
    setDragOverStageId(null);
  }, []);

  const handleDrop = useCallback((e, targetStageId) => {
    e.preventDefault();
    const sourceId = Number(e.dataTransfer.getData("text/plain"));
    if (!sourceId || sourceId === targetStageId) {
      setDraggingStageId(null);
      setDragOverStageId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const placement = e.clientY > rect.top + rect.height / 2 ? "after" : "before";
    setStages(previous => reorderStage(previous, sourceId, targetStageId, placement));
    setDraggingStageId(null);
    setDragOverStageId(null);
  }, [setStages]);

  const moveByOffset = useCallback((stageId, offset) => {
    setStages(previous => moveStageByOffset(previous, stageId, offset));
  }, [setStages]);

  return {
    draggingStageId,
    dragOverStageId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    moveByOffset,
  };
}
