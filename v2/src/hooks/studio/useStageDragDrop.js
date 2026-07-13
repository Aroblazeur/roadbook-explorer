"use client";

import { useCallback, useState } from "react";

export default function useStageDragDrop({ stages, handleMoveStage }) {
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
    handleMoveStage(sourceId, targetStageId);
    setDraggingStageId(null);
    setDragOverStageId(null);
  }, [handleMoveStage]);

  return {
    draggingStageId,
    dragOverStageId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
  };
}
