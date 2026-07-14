import { useCallback, useState } from "react";
import { conditionalUpdateRoadbook } from "@/lib/sync-helpers";
import { deleteRoadbook, updateStages } from "@/lib/roadbooks/writers";
import { buildEditableStageUpdate, normalizeNumber } from "@/lib/roadbooks/validators";

export default function useSaveActions({
  supabase, id, roadbook, setRoadbook,
  title, description, activity, destination, project,
  isPublic, setIsPublic,
  officialRoute, traceRoute,
  coverMode, coverUrl, coverMediaId,
  stages,
  setError, setSuccess, markRemoteConflict,
  saveWithLock,
  clearDraft, onDeleted,
}) {
  const [deletingRoadbook, setDeletingRoadbook] = useState(false);
  const handleSaveAll = useCallback(async () => {
    if (!title.trim()) { setError("Le titre est obligatoire."); return false; }
    if (stages.some(stage => !normalizeNumber(stage.stage_number))) {
      setError("Chaque étape doit avoir un numéro valide.");
      return false;
    }
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
      distance: normalizeNumber(traceRoute.traceDist), elevationGain: normalizeNumber(traceRoute.traceGain),
      elevationLoss: normalizeNumber(traceRoute.traceLoss), gpx: traceRoute.traceGpx || null,
      mapEmbedUrl: traceRoute.traceMap || null,
    };
    const updateFields = {
      title: title.trim(), description, metadata: meta,
      distance_km: normalizeNumber(traceRoute.traceDist),
      elevation_gain_m: normalizeNumber(traceRoute.traceGain),
      elevation_loss_m: normalizeNumber(traceRoute.traceLoss),
      cover_image_url: coverMode === "url" ? coverUrl.trim() || null : null,
      cover_media_id: coverMode === "media" ? coverMediaId : null,
    };
    return saveWithLock({
      getUpdateFields: () => updateFields,
      getUpdatedRoadbook: (prev, data) => ({ ...prev, ...updateFields, updated_at: data.updated_at }),
      persistRelated: () => updateStages(supabase, stages, buildEditableStageUpdate),
      successMessage: "Toutes les modifications ont été enregistrées.",
    });
  }, [title, description, activity, destination, project, roadbook, officialRoute, traceRoute, coverMode, coverUrl, coverMediaId, stages, supabase, saveWithLock, setError]);

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
