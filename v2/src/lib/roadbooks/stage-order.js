function numericStageNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function sameStageId(left, right) {
  return String(left) === String(right);
}

export function normalizeStagePositions(stages) {
  const source = stages ?? [];
  const ordered = [
    ...source.filter(stage => !isRoadbookItemDraft(stage)),
    ...source.filter(isRoadbookItemDraft),
  ];
  return ordered.map((stage, index) => ({
    ...stage,
    sort_order: index + 1,
    stage_number: index + 1,
  }));
}

export function isRoadbookItemDraft(item) {
  return item?.metadata?.status === "draft" || item?.metadata?.isDraft === true;
}

export function withDraftStatus(item, draft) {
  const metadata = { ...(item?.metadata ?? {}) };
  if (draft) metadata.status = "draft";
  else {
    delete metadata.status;
    delete metadata.isDraft;
  }
  return { ...item, metadata };
}

export function normalizeVariantPositions(variants) {
  return (variants ?? []).map((variant, index) => ({ ...variant, sort_order: index + 1 }));
}

export function moveVariantByOffset(variants, variantId, offset) {
  const sourceIndex = (variants ?? []).findIndex(variant => sameStageId(variant.id, variantId));
  const targetIndex = sourceIndex + offset;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= variants.length) return variants;
  const next = [...variants];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return normalizeVariantPositions(next);
}

export function reorderVariant(variants, sourceId, targetId, placement = "before") {
  const sourceIndex = (variants ?? []).findIndex(variant => sameStageId(variant.id, sourceId));
  const targetIndex = (variants ?? []).findIndex(variant => sameStageId(variant.id, targetId));
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return variants;
  const next = variants.filter(variant => !sameStageId(variant.id, sourceId));
  const remainingTargetIndex = next.findIndex(variant => sameStageId(variant.id, targetId));
  next.splice(remainingTargetIndex + (placement === "after" ? 1 : 0), 0, variants[sourceIndex]);
  return normalizeVariantPositions(next);
}

export function buildStageTitle(stage, displayLabel) {
  const route = [stage?.departure, stage?.arrival]
    .map(value => String(value ?? "").trim())
    .filter(Boolean)
    .join(" → ");
  const prefix = `Étape ${displayLabel}`;
  return route ? `${prefix} - ${route}` : prefix;
}

export function hasCustomStageTitle(stage) {
  return stage?.metadata?.titleMode === "custom" && String(stage?.title ?? "").trim() !== "";
}

export function resolveStageTitle(stage, displayLabel) {
  return hasCustomStageTitle(stage)
    ? String(stage.title).trim()
    : buildStageTitle(stage, displayLabel);
}

function ensureVariantMarker(value) {
  const title = String(value ?? "").trim();
  if (!title) return "";
  return /\bvariante\b/iu.test(title) ? title : `Variante - ${title}`;
}

export function buildVariantTitle(variant, parentDisplayLabel) {
  const route = [variant?.departure, variant?.arrival]
    .map(value => String(value ?? "").trim())
    .filter(Boolean)
    .join(" → ");
  const number = Number(variant?.sort_order);
  const variantLabel = Number.isInteger(number) && number > 0 ? `Variante ${number}` : "Variante";
  const prefix = parentDisplayLabel ? `Étape ${parentDisplayLabel} - ${variantLabel}` : variantLabel;
  return route ? `${prefix} - ${route}` : prefix;
}

export function resolveVariantTitle(variant, parentDisplayLabel) {
  if (variant?.metadata?.titleMode === "auto" || !String(variant?.label ?? "").trim()) {
    return buildVariantTitle(variant, parentDisplayLabel);
  }
  return ensureVariantMarker(variant.label);
}

export function synchronizeStagePresentation(stages, { normalizePositions = true } = {}) {
  const ordered = normalizePositions ? normalizeStagePositions(stages) : (stages ?? []).map(stage => ({ ...stage }));
  return ordered.map((stage, index, all) => ({
    ...stage,
    stage_label: null,
    title: resolveStageTitle(stage, stageDisplayLabel(all, index)),
  }));
}

export function mergeRemoteStagesIntoDraft(remoteStages, draftStages) {
  const remote = Array.isArray(remoteStages) ? remoteStages : [];
  if (!Array.isArray(draftStages)) return synchronizeStagePresentation(remote);

  const remoteById = new Map(remote.map(stage => [String(stage.id), stage]));
  const merged = draftStages.map(stage => {
    const remoteStage = remoteById.get(String(stage.id));
    if (!remoteStage) return stage;
    return {
      ...remoteStage,
      ...stage,
      metadata: { ...(remoteStage.metadata ?? {}), ...(stage.metadata ?? {}) },
    };
  });
  const knownIds = new Set(merged.map(stage => String(stage.id)));

  for (const remoteStage of remote) {
    if (knownIds.has(String(remoteStage.id))) continue;

    const remoteIsDraft = isRoadbookItemDraft(remoteStage);
    const remoteOrder = Number(remoteStage.sort_order) || Number.MAX_SAFE_INTEGER;
    const insertionIndex = merged.findIndex(stage => {
      const stageIsDraft = isRoadbookItemDraft(stage);
      if (stageIsDraft !== remoteIsDraft) return !remoteIsDraft && stageIsDraft;
      const stageOrder = Number(stage.sort_order) || Number.MAX_SAFE_INTEGER;
      return stageOrder >= remoteOrder;
    });

    merged.splice(insertionIndex < 0 ? merged.length : insertionIndex, 0, remoteStage);
    knownIds.add(String(remoteStage.id));
  }

  return synchronizeStagePresentation(merged);
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
  const followingStage = remaining[insertionIndex];
  const movedNumber = placement === "after" && followingStage
    ? followingStage.stage_number
    : target.stage_number;
  const moved = { ...source, stage_number: movedNumber };
  remaining.splice(insertionIndex, 0, moved);
  return synchronizeStagePresentation(remaining);
}

export function moveStageByOffset(stages, stageId, offset) {
  const sourceIndex = stages.findIndex(stage => sameStageId(stage.id, stageId));
  if (sourceIndex < 0) return stages;
  const source = stages[sourceIndex];
  const siblings = stages.filter(stage => isRoadbookItemDraft(stage) === isRoadbookItemDraft(source));
  const siblingIndex = siblings.findIndex(stage => sameStageId(stage.id, stageId));
  const targetIndex = siblingIndex + offset;
  if (targetIndex < 0 || targetIndex >= siblings.length) return stages;
  return reorderStage(stages, stageId, siblings[targetIndex].id, offset > 0 ? "after" : "before");
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
  return normalizeStagePositions(stages).map((stage, index, all) => {
    const stageDisplay = stageDisplayLabel(all, index);
    return {
      ...stage,
      stage_display_label: stageDisplay,
      stage_label: null,
      title: resolveStageTitle(stage, stageDisplay),
    };
  });
}

export function synchronizeVariantPresentation(variantsByStage, stages) {
  const stageLabels = new Map((stages ?? []).map((stage, index, all) => [
    String(stage.id),
    stageDisplayLabel(all, index),
  ]));
  return Object.fromEntries(Object.entries(variantsByStage ?? {}).map(([stageId, variants]) => [
    stageId,
    (variants ?? []).map(variant => ({
      ...variant,
      label: resolveVariantTitle(variant, stageLabels.get(String(stageId))),
    })),
  ]));
}

export function withVariantDisplayTitles(stages, variants) {
  const stageLabels = new Map((stages ?? []).map((stage, index, all) => [
    String(stage.id),
    stageDisplayLabel(all, index),
  ]));
  return (variants ?? []).map(variant => ({
    ...variant,
    label: resolveVariantTitle(variant, stageLabels.get(String(variant.stage_id))),
  }));
}
