import { useCallback, useState } from "react";
import { fetchAndComputeGpxMetrics, estimateGpxHours, formatDuration } from "@/lib/gpx-metrics";
import { loadGpxRows, getSignedUrl } from "@/lib/roadbooks/loaders";
import { buildCanonicalGpxMediaInput, formatGpxUserError, classifyGpxMedia, selectGpxMedia, selectUniqueGpxMedia } from "@/lib/roadbooks/gpx-media";
import { uploadGpx, updateGpxRecord, deleteGpx as deleteGpxWriter, updateStage } from "@/lib/roadbooks/writers";
import { buildGpxPath, validateGpx } from "@/lib/roadbooks/validators";

const GPX_BUCKET = "roadbook-gpx";

export function useGpxManager({ supabase, roadbookId, userId, activity, reloadStages, onMutation }) {
  const [gpxError, setGpxError] = useState(null);
  const [gpxUploading, setGpxUploading] = useState(null);
  const [gpxOfficial, setGpxOfficial] = useState(null);
  const [gpxCustom, setGpxCustom] = useState(null);
  const [gpxByStage, setGpxByStage] = useState({});
  const [gpxByVariant, setGpxByVariant] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(null);

  const reloadGpx = useCallback(async () => {
    if (!userId || !roadbookId) return;
    try {
      const rows = await loadGpxRows(supabase, roadbookId);
      const rbId = Number(roadbookId);
      const selection = selectUniqueGpxMedia(rows);

      const officialResult = selectGpxMedia(rows, { roadbookId: rbId, stageId: null, variantId: null, scope: "roadbook", role: "official" });
      setGpxOfficial(officialResult.status === "selected" ? officialResult.media : null);

      const customResult = selectGpxMedia(rows, { roadbookId: rbId, stageId: null, variantId: null, scope: "roadbook", role: "custom" });
      setGpxCustom(customResult.status === "selected" ? customResult.media : null);

      const byStage = {};
      const byVariant = {};
      for (const { media, classification } of selection.unique.values()) {
        if (classification.scope === "stage" && classification.stageId) {
          byStage[classification.stageId] = media;
        } else if (classification.scope === "variant" && classification.stageId && classification.variantId) {
          if (!byVariant[classification.stageId]) byVariant[classification.stageId] = {};
          byVariant[classification.stageId][classification.variantId] = media;
        }
      }
      setGpxByStage(byStage);
      setGpxByVariant(byVariant);

      if (selection.duplicates.length > 0) {
        setGpxError("Certains GPX ne peuvent pas être chargés car plusieurs médias existent pour la même cible.");
      } else {
        setGpxError(null);
      }
    } catch (err) {
      setGpxError(formatGpxUserError(err, "Impossible de charger les GPX."));
    }
  }, [supabase, roadbookId, userId]);

  const uploadGpx = useCallback(async (file, { scope, role, stageId, variantId }) => {
    const valErr = validateGpx(file);
    if (valErr) { setGpxError(valErr); return; }
    const built = buildCanonicalGpxMediaInput({ roadbookId: Number(roadbookId), scope, role, stageId, variantId, existingMetadata: { original_name: file.name, original_size: file.size } });
    if (!built.ok) { setGpxError(built.errors.join(" ; ")); return; }
    try {
      const rows = await loadGpxRows(supabase, roadbookId);
      const existing = selectGpxMedia(rows, { roadbookId: Number(roadbookId), stageId: stageId ?? null, variantId: variantId ?? null, scope, role });
      if (existing.status === "selected") {
        setGpxError(`Un GPX ${role} existe déjà pour cette cible. Utilisez le remplacement.`);
        return;
      }
      if (existing.status === "duplicate-identity") {
        setGpxError("Impossible d'enregistrer ce GPX : plusieurs médias existent déjà pour cette cible.");
        return;
      }
    } catch (err) {
      setGpxError(formatGpxUserError(err, "Impossible de vérifier les GPX existants."));
      return;
    }
    setGpxError(null);
    setGpxUploading(role ?? stageId);
    try {
      let path;
      try {
        path = buildGpxPath(userId, Number(roadbookId), scope, role, stageId, variantId);
      } catch (pathErr) {
        setGpxError(formatGpxUserError(pathErr, "Impossible de construire le chemin de stockage."));
        setGpxUploading(null);
        return;
      }
      path += `-${file.name}`;
      await uploadGpx(supabase, GPX_BUCKET, path, file, {
        record: { ...built.record, file_name: file.name, mime_type: "application/gpx+xml", uploaded_by: userId },
      });
      await reloadGpx();
      await onMutation?.();
    } catch (err) { setGpxError(formatGpxUserError(err, "Impossible d'enregistrer le GPX.")); }
    finally { setGpxUploading(null); }
  }, [supabase, roadbookId, userId, reloadGpx, onMutation]);

  const replaceGpx = useCallback(async (file, mediaRow, { scope, role, stageId, variantId }) => {
    const valErr = validateGpx(file);
    if (valErr) { setGpxError(valErr); return; }
    const built = buildCanonicalGpxMediaInput({ roadbookId: Number(roadbookId), scope, role, stageId, variantId, existingMetadata: { ...mediaRow.metadata, original_name: file.name, original_size: file.size } });
    if (!built.ok) { setGpxError(built.errors.join(" ; ")); return; }
    const rowClass = classifyGpxMedia(mediaRow);
    if (!rowClass || rowClass.status === "ambiguous" || rowClass.status === "invalid") {
      setGpxError("Impossible de remplacer ce GPX : le média cible est ambigu ou invalide.");
      return;
    }
    const targetClass = classifyGpxMedia({ ...mediaRow, metadata: built.record.metadata });
    if (targetClass.status !== "canonical") {
      setGpxError("Impossible de remplacer ce GPX : la cible métier est contradictoire.");
      return;
    }
    setGpxError(null);
    setGpxUploading(role ?? stageId);
    try {
      await uploadGpx(supabase, GPX_BUCKET, mediaRow.path, file, { upsert: true });
      await updateGpxRecord(supabase, mediaRow.id, { file_name: file.name, metadata: built.record.metadata });
      await reloadGpx();
      await onMutation?.();
    } catch (err) { setGpxError(formatGpxUserError(err, "Impossible de remplacer le GPX.")); }
    finally { setGpxUploading(null); }
  }, [supabase, roadbookId, reloadGpx, onMutation]);

  const deleteGpx = useCallback(async (mediaRow) => {
    setGpxUploading("delete");
    try {
      await deleteGpxWriter(supabase, mediaRow, GPX_BUCKET);
      await reloadGpx();
      await onMutation?.();
    } catch (err) { setGpxError(formatGpxUserError(err, "Impossible de supprimer le GPX.")); }
    finally { setGpxUploading(null); }
  }, [supabase, reloadGpx, onMutation]);

  const downloadGpx = useCallback(async (mediaRow) => {
    try {
      const signedUrl = await getSignedUrl(supabase, GPX_BUCKET, mediaRow.path, 3600);
      if (!signedUrl) return;
      const a = document.createElement("a"); a.href = signedUrl; a.download = mediaRow.file_name; a.click();
    } catch (err) {
      setGpxError(formatGpxUserError(err, "Impossible de télécharger le GPX."));
    }
  }, [supabase]);

  const computeStageMetrics = useCallback(async (mediaRow, stage) => {
    if (!mediaRow || !stage) return null;
    setMetricsLoading(stage.id);
    setGpxError(null);
    try {
      const signedUrl = await getSignedUrl(supabase, GPX_BUCKET, mediaRow.path, 3600);
      if (!signedUrl) throw new Error("Impossible d'obtenir l'URL signée du GPX");
      const metrics = await fetchAndComputeGpxMetrics(signedUrl);
      const hours = estimateGpxHours(metrics.distanceKm, metrics.elevationGainM, activity);
      const durationStr = formatDuration(hours);
      const anyExisting = stage.distance_km != null || stage.elevation_gain_m != null || stage.elevation_loss_m != null || stage.duration != null;
      return { metrics, durationStr, stage, anyExisting };
    } catch (err) {
      setGpxError(formatGpxUserError(err, "Impossible de calculer les métriques du GPX."));
      return null;
    } finally {
      setMetricsLoading(null);
    }
  }, [supabase, activity]);

  const analyzeStageGpx = useCallback(async (gpx, stage) => {
    if (!gpx || !stage) return null;
    try {
      const signedUrl = await getSignedUrl(supabase, GPX_BUCKET, gpx.path, 3600);
      if (!signedUrl) return { error: "URL signée indisponible", stageNumber: stage.stage_number };
      const metrics = await fetchAndComputeGpxMetrics(signedUrl);
      const hours = estimateGpxHours(metrics.distanceKm, metrics.elevationGainM, activity);
      const durationStr = formatDuration(hours);
      return { metrics, durationStr, stage, error: null };
    } catch (err) {
      return { error: formatGpxUserError(err, "Impossible d'analyser le GPX de cette étape."), stageNumber: stage.stage_number };
    }
  }, [supabase, activity]);

  const applyStageMetrics = useCallback(async (metrics, durationStr, stage) => {
    if (!stage) return false;
    try {
      const update = {};
      if (metrics.distanceKm > 0) update.distance_km = Math.round(metrics.distanceKm * 100) / 100;
      if (metrics.elevationGainM != null) update.elevation_gain_m = Math.round(metrics.elevationGainM);
      if (metrics.elevationLossM != null) update.elevation_loss_m = Math.round(metrics.elevationLossM);
      if (durationStr) update.duration = durationStr;
      await updateStage(supabase, stage.id, update);
      if (reloadStages) await reloadStages();
      return true;
    } catch (err) {
      setGpxError(formatGpxUserError(err, "Impossible d'appliquer les métriques à l'étape."));
      return false;
    }
  }, [supabase, reloadStages]);

  return {
    gpxOfficial, setGpxOfficial, gpxCustom, setGpxCustom, gpxByStage, setGpxByStage, gpxByVariant, setGpxByVariant,
    gpxUploading, metricsLoading,
    gpxError, setGpxError,
    reloadGpx,
    uploadGpx,
    replaceGpx,
    deleteGpx,
    downloadGpx,
    computeStageMetrics,
    analyzeStageGpx,
    applyStageMetrics,
    GPX_BUCKET,
  };
}
