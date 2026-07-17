"use client";

import { useCallback, useState } from "react";
import { moveVariantByOffset, normalizeVariantPositions, reorderVariant } from "@/lib/roadbooks/stage-order";

export default function useVariantDragDrop({ setVariantsByStage }) {
  const [draggingVariantId, setDraggingVariantId] = useState(null);
  const [dragOverVariantId, setDragOverVariantId] = useState(null);

  const handleDragStart = useCallback((event, stageId, variantId) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-roadbook-variant", JSON.stringify({ stageId, variantId }));
    setDraggingVariantId(variantId);
  }, []);

  const handleDragOver = useCallback((event, variantId) => {
    if (!event.dataTransfer.types.includes("application/x-roadbook-variant")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverVariantId(variantId);
  }, []);

  const handleDrop = useCallback((event, targetStageId, targetVariantId) => {
    const raw = event.dataTransfer.getData("application/x-roadbook-variant");
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    const source = JSON.parse(raw);
    if (String(source.stageId) !== String(targetStageId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    setVariantsByStage(previous => ({
      ...previous,
      [targetStageId]: reorderVariant(previous[targetStageId] ?? [], source.variantId, targetVariantId, placement),
    }));
    setDraggingVariantId(null);
    setDragOverVariantId(null);
  }, [setVariantsByStage]);

  const handleDragEnd = useCallback(() => {
    setDraggingVariantId(null);
    setDragOverVariantId(null);
  }, []);

  const moveByOffset = useCallback((stageId, variantId, offset) => {
    setVariantsByStage(previous => ({ ...previous, [stageId]: moveVariantByOffset(previous[stageId] ?? [], variantId, offset) }));
  }, [setVariantsByStage]);

  const moveToStage = useCallback((sourceStageId, variantId, targetStageId) => {
    if (!targetStageId || String(sourceStageId) === String(targetStageId)) return;
    setVariantsByStage(previous => {
      const source = previous[sourceStageId] ?? [];
      const variant = source.find(item => String(item.id) === String(variantId));
      if (!variant) return previous;
      return {
        ...previous,
        [sourceStageId]: normalizeVariantPositions(source.filter(item => String(item.id) !== String(variantId))),
        [targetStageId]: normalizeVariantPositions([...(previous[targetStageId] ?? []), { ...variant, stage_id: Number(targetStageId) }]),
      };
    });
  }, [setVariantsByStage]);

  return { draggingVariantId, dragOverVariantId, handleDragStart, handleDragOver, handleDrop, handleDragEnd, moveByOffset, moveToStage };
}
