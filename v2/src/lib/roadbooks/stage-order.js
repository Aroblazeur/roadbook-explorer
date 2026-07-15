function numericStageNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function sameStageId(left, right) {
  return String(left) === String(right);
}

export function normalizeStagePositions(stages) {
  return (stages ?? []).map((stage, index) => ({ ...stage, sort_order: index + 1 }));
}

export function buildStageTitle(stage, displayLabel) {
  const route = [stage?.departure, stage?.arrival]
    .map(value => String(value ?? "").trim())
    .filter(Boolean)
    .join(" → ");
  const prefix = `Étape ${displayLabel}`;
  return route ? `${prefix} - ${route}` : prefix;
}

export function synchronizeStagePresentation(stages, { normalizePositions = true } = {}) {
  const ordered = normalizePositions ? normalizeStagePositions(stages) : (stages ?? []).map(stage => ({ ...stage }));
  return ordered.map((stage, index, all) => ({
    ...stage,
    title: buildStageTitle(stage, stageDisplayLabel(all, index)),
  }));
}

export function updateStageFields(stages, stageId, updates) {
  const next = (stages ?? []).map(stage => sameStageId(stage.id, stageId) ? { ...stage, ...updates } : stage);
  return synchronizeStagePresentation(next);
}

export function updateStageNumberAndOrder(stages, stageId, value) {
  const currentIndex = stages.findIndex(stage => sameStageId(stage.id, stageId));
  if (currentIndex < 0) return stages;
  const current = stages[currentIndex];
  const nextNumber = numericStageNumber(value);
  const currentNumber = numericStageNumber(current.stage_number);
  if (nextNumber == null || nextNumber === currentNumber) {
    return synchronizeStagePresentation(stages.map(stage => sameStageId(stage.id, stageId) ? { ...stage, stage_number: value } : stage));
  }

  const remaining = stages.filter(stage => !sameStageId(stage.id, stageId));
  const insertionIndex = remaining.findIndex(stage => {
    const number = numericStageNumber(stage.stage_number);
    return number != null && number >= nextNumber;
  });
  const next = [...remaining];
  next.splice(insertionIndex < 0 ? next.length : insertionIndex, 0, { ...current, stage_number: value });
  return synchronizeStagePresentation(next);
}

export function reorderStage(stages, sourceId, targetId, placement = "before") {
  const sourceIndex = stages.findIndex(stage => sameStageId(stage.id, sourceId));
  const targetIndex = stages.findIndex(stage => sameStageId(stage.id, targetId));
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return stages;
  const source = stages[sourceIndex];
  const target = stages[targetIndex];
  const remaining = stages.filter(stage => !sameStageId(stage.id, sourceId));
  const remainingTargetIndex = remaining.findIndex(stage => sameStageId(stage.id, targetId));
  const insertionIndex = remainingTargetIndex + (placement === "after" ? 1 : 0);
  const moved = { ...source, stage_number: target.stage_number };
  remaining.splice(insertionIndex, 0, moved);
  return synchronizeStagePresentation(remaining);
}

export function moveStageByOffset(stages, stageId, offset) {
  const sourceIndex = stages.findIndex(stage => sameStageId(stage.id, stageId));
  const targetIndex = sourceIndex + offset;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= stages.length) return stages;
  return reorderStage(stages, stageId, stages[targetIndex].id, offset > 0 ? "after" : "before");
}

const DUPLICATE_SUFFIXES = ["", " bis", " ter", " quater", " quinquies"];

export function stageDisplayLabel(stages, index) {
  const stage = stages[index];
  if (!stage) return String(index + 1);
  const base = String(stage.stage_number ?? index + 1);
  const duplicateIndex = stages.slice(0, index).filter(item => String(item.stage_number) === String(stage.stage_number)).length;
  return duplicateIndex < DUPLICATE_SUFFIXES.length
    ? `${base}${DUPLICATE_SUFFIXES[duplicateIndex]}`
    : `${base} (${duplicateIndex + 1})`;
}

export function withStageDisplayLabels(stages) {
  return (stages ?? []).map((stage, index, all) => {
    const stageDisplay = stageDisplayLabel(all, index);
    return {
      ...stage,
      stage_display_label: stageDisplay,
      title: buildStageTitle(stage, stageDisplay),
    };
  });
}
