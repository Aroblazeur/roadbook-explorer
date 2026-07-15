import { useCallback, useState } from "react";
import { conditionalUpdateRoadbook } from "@/lib/sync-helpers";
import { deleteRoadbook, updatePois, updateStages, updateVariants } from "@/lib/roadbooks/writers";
import { buildEditableStageUpdate, buildEditableVariantUpdate, normalizeNumber } from "@/lib/roadbooks/validators";
import { calculateTotals } from "@/lib/roadbooks/mutations";
import { synchronizeStagePresentation } from "@/lib/roadbooks/stage-order";

export default function useSaveActions({
  supabase, id, roadbook, setRoadbook,
  title, description, activity, destination, project,
  isPublic, setIsPublic,
  officialRoute, traceRoute,
  coverMode, coverUrl, coverMediaId,
  stages, setStages, poisByStage, setPoisByStage, poisByVariant, setPoisByVariant, variantsByStage, setVariantsByStage, setTraceRoute,
  prepareAutomaticCompletion,
  prepareStartPointForSave, persistStartPoint, setStartPoint,
  setError, setSuccess, markRemoteConflict,
  saveWithLock,
  clearDraft, onDeleted,
}) {
  const [deletingRoadbook, setDeletingRoadbook] = useState(false);
  const handleSaveAll = useCallback(async () => {
    if (!title.trim()) { setError("Le titre est obligatoire."); return false; }
    let automation = { stages, variantsByStage, poisByStage, poisByVariant, poiUpdates: [], report: { fields: 0, warnings: [] } };
    try {
      automation = await prepareAutomaticCompletion?.() ?? automation;
    } catch (error) {
      automation.report.warnings.push(error?.message ?? String(error));
    }
    let startPointAutomation = { value: null, report: { fields: 0, warnings: [] } };
    try {
      startPointAutomation = await prepareStartPointForSave?.() ?? startPointAutomation;
    } catch (error) {
      startPointAutomation.report.warnings.push(error?.message ?? String(error));
    }
    const completedStages = synchronizeStagePresentation(automation.stages ?? stages);
    const completedVariantsByStage = automation.variantsByStage ?? variantsByStage;
    const completedPois = automation.poisByStage ?? poisByStage;
    const completedVariantPois = automation.poisByVariant ?? poisByVariant;
    if (completedStages.some(stage => !normalizeNumber(stage.stage_number))) {
      setError("Chaque étape doit avoir un numéro valide.");
      return false;
    }
    const totals = calculateTotals(completedStages);
    const traceDistance = normalizeNumber(traceRoute.traceDist) ?? totals.totalDist;
    const traceGain = normalizeNumber(traceRoute.traceGain) ?? totals.totalGain;
    const traceLoss = normalizeNumber(traceRoute.traceLoss) ?? totals.totalLoss;
    const meta = { ...(roadbook?.metadata ?? {}) };
    if (activity) meta.activity = activity; else delete meta.activity;
    if (destination) meta.destination = destination; else delete meta.destination;
    if (project) meta.project = project; else delete meta.project;
    meta.official = {
      distance: normalizeNumber(officialRoute.officialDist), elevationGain: normalizeNumber(officialRoute.officialGain),
      elevationLoss: normalizeNumber(officialRoute.officialLoss), gpx: officialRoute.officialGpx || null,
      mapEmbedUrl: officialRoute.officialMap || null,
    };
    meta.stagesTotal = {
      distance: traceDistance, elevationGain: traceGain,
      elevationLoss: traceLoss, gpx: traceRoute.traceGpx || null,
      mapEmbedUrl: traceRoute.traceMap || null,
    };
    const updateFields = {
      title: title.trim(), description, metadata: meta,
      distance_km: traceDistance,
      elevation_gain_m: traceGain,
      elevation_loss_m: traceLoss,
      cover_image_url: coverMode === "url" ? coverUrl.trim() || null : null,
      cover_media_id: coverMode === "media" ? coverMediaId : null,
    };
    const warningCount = (automation.report?.warnings?.length ?? 0) + (startPointAutomation.report?.warnings?.length ?? 0);
    const automatedFields = (automation.report?.fields ?? 0) + (startPointAutomation.report?.fields ?? 0);
    const saved = await saveWithLock({
      getUpdateFields: () => updateFields,
      getUpdatedRoadbook: (prev, data) => ({ ...prev, ...updateFields, updated_at: data.updated_at }),
      persistRelated: () => Promise.all([
        updateStages(supabase, completedStages, buildEditableStageUpdate),
        updateVariants(supabase, completedVariantsByStage, buildEditableVariantUpdate),
        updatePois(supabase, automation.poiUpdates ?? []),
        startPointAutomation.value ? persistStartPoint?.(startPointAutomation.value) : Promise.resolve(),
      ]),
      successMessage: `Toutes les modifications ont été enregistrées.${automatedFields ? ` ${automatedFields} champ(s) complété(s) automatiquement.` : ""}${warningCount ? ` ${warningCount} automatisation(s) indisponible(s).` : ""}`,
    });
    if (saved) {
      setStages(completedStages);
      setVariantsByStage(completedVariantsByStage);
      setPoisByStage(completedPois);
      setPoisByVariant?.(completedVariantPois);
      setTraceRoute(previous => ({
        ...previous,
        traceDist: traceDistance != null ? String(traceDistance) : "",
        traceGain: traceGain != null ? String(traceGain) : "",
        traceLoss: traceLoss != null ? String(traceLoss) : "",
      }));
      if (startPointAutomation.value) setStartPoint?.(startPointAutomation.value);
    }
    return saved;
  }, [title, description, activity, destination, project, roadbook, officialRoute, traceRoute, coverMode, coverUrl, coverMediaId, stages, poisByStage, poisByVariant, variantsByStage, supabase, saveWithLock, setError, setStages, setVariantsByStage, setPoisByStage, setPoisByVariant, setTraceRoute, prepareAutomaticCompletion, prepareStartPointForSave, persistStartPoint, setStartPoint]);

  const handleToggleVisibility = useCallback(async () => {
    const result = await conditionalUpdateRoadbook(supabase, id, { is_public: !isPublic }, roadbook?.updated_at);
    if (!result.ok) {
      if (result.error === "conflict") { markRemoteConflict(); setError("Conflit de version. Rechargez et réessayez."); }
      else setError(result.error);
      return;
    }
    setIsPublic(!isPublic);
    setRoadbook(prev => ({ ...prev, is_public: !isPublic, updated_at: result.data.updated_at }));
    setSuccess(isPublic ? "Roadbook passé en privé." : "Roadbook passé en public.");
    try { await fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roadbookId: id }) }); } catch {}
  }, [supabase, id, isPublic, roadbook, setRoadbook, setError, setSuccess, markRemoteConflict, setIsPublic]);

  const handleDeleteRoadbook = useCallback(async () => {
    if (!window.confirm(`Supprimer définitivement « ${roadbook?.title ?? "ce roadbook"} » ?`)) return;
    setDeletingRoadbook(true);
    setError(null);
    try {
      await deleteRoadbook(supabase, id);
      clearDraft?.();
      onDeleted?.();
    } catch (error) {
      setError(error?.message ?? String(error));
      setDeletingRoadbook(false);
    }
  }, [supabase, id, roadbook, clearDraft, onDeleted, setError]);

  return { handleSaveAll, handleToggleVisibility, handleDeleteRoadbook, deletingRoadbook };
}
