import { useCallback } from "react";
import { conditionalUpdateRoadbook } from "@/lib/sync-helpers";

export default function useSaveActions({
  supabase, id, roadbook, setRoadbook,
  title, description, activity, destination, project,
  isPublic, setIsPublic,
  officialRoute, traceRoute,
  setError, setSuccess, markRemoteConflict,
  saveWithLock,
}) {
  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    const meta = { ...(roadbook?.metadata ?? {}) };
    if (activity) meta.activity = activity; else delete meta.activity;
    if (destination) meta.destination = destination; else delete meta.destination;
    if (project) meta.project = project; else delete meta.project;
    await saveWithLock({
      getUpdateFields: () => ({ title, description, metadata: meta }),
      getUpdatedRoadbook: (prev, data) => ({ ...prev, title, description, metadata: meta, updated_at: data.updated_at }),
      successMessage: "Roadbook mis à jour.",
    });
  }, [roadbook, activity, destination, project, title, description, saveWithLock]);

  const handleSaveRoute = useCallback(async (e, mode) => {
    e.preventDefault();
    const meta = { ...(roadbook?.metadata ?? {}) };
    const updateFields = {};
    if (mode === "official") {
      meta.official = {
        distance: officialRoute.officialDist ? Number(officialRoute.officialDist) : null,
        elevationGain: officialRoute.officialGain ? Number(officialRoute.officialGain) : null,
        elevationLoss: officialRoute.officialLoss ? Number(officialRoute.officialLoss) : null,
        gpx: officialRoute.officialGpx || null,
        mapEmbedUrl: officialRoute.officialMap || null,
      };
    } else {
      meta.stagesTotal = {
        distance: traceRoute.traceDist ? Number(traceRoute.traceDist) : null,
        elevationGain: traceRoute.traceGain ? Number(traceRoute.traceGain) : null,
        elevationLoss: traceRoute.traceLoss ? Number(traceRoute.traceLoss) : null,
        gpx: traceRoute.traceGpx || null,
        mapEmbedUrl: traceRoute.traceMap || null,
      };
      updateFields.distance_km = traceRoute.traceDist ? Number(traceRoute.traceDist) : null;
      updateFields.elevation_gain_m = traceRoute.traceGain ? Number(traceRoute.traceGain) : null;
      updateFields.elevation_loss_m = traceRoute.traceLoss ? Number(traceRoute.traceLoss) : null;
    }
    await saveWithLock({
      getUpdateFields: () => ({ metadata: meta, ...updateFields }),
      getUpdatedRoadbook: (prev, data) => ({ ...prev, metadata: meta, ...updateFields, updated_at: data.updated_at }),
      successMessage: mode === "official" ? "Itinéraire officiel mis à jour." : "Tracé actuel mis à jour.",
    });
  }, [roadbook, officialRoute, traceRoute, saveWithLock]);

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

  return { handleSave, handleSaveRoute, handleToggleVisibility };
}
