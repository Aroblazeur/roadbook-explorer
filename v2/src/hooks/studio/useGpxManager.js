import { useCallback, useState } from "react";
import { fetchAndComputeGpxMetrics, estimateGpxHours, formatDuration } from "@/lib/gpx-metrics";
import { loadGpxRows, getSignedUrl } from "@/lib/roadbooks/loaders";
import { buildCanonicalGpxMediaInput } from "@/lib/roadbooks/gpx-media";
import { uploadGpx, updateGpxRecord, deleteGpx as deleteGpxWriter, updateStage } from "@/lib/roadbooks/writers";
import { buildGpxPath, validateGpx } from "@/lib/roadbooks/validators";

const GPX_BUCKET = "roadbook-gpx";

export function useGpxManager({ supabase, roadbookId, userId, reloadStages }) {
  const [gpxError, setGpxError] = useState(null);
  const [gpxUploading, setGpxUploading] = useState(null);
  const [gpxOfficial, setGpxOfficial] = useState(null);
  const [gpxCustom, setGpxCustom] = useState(null);
  const [gpxByStage, setGpxByStage] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(null);

  const reloadGpx = useCallback(async () => {
    if (!userId || !roadbookId) return;
    try {
      const rows = await loadGpxRows(supabase, roadbookId);
      const official = rows.find(r => r.metadata?.role === "official" || r.metadata?.gpx_role === "official");
      const custom = rows.find(r => r.metadata?.role === "custom" || r.metadata?.gpx_role === "custom");
      setGpxOfficial(official ?? null);
      setGpxCustom(custom ?? null);
      const byStage = {};
      rows.filter(r => r.metadata?.scope === "stage" && r.stage_id).forEach(r => { byStage[r.stage_id] = r; });
      setGpxByStage(byStage);
    } catch (err) {
      setGpxError(`Impossible de charger les GPX : ${err.message}`);
    }
  }, [supabase, roadbookId, userId]);

  const uploadGpx = useCallback(async (file, { scope, role, stageId }) => {
    const valErr = validateGpx(file);
    if (valErr) { setGpxError(valErr); return; }
    const built = buildCanonicalGpxMediaInput({ roadbookId: Number(roadbookId), scope, role, stageId, existingMetadata: { original_name: file.name, original_size: file.size } });
    if (!built.ok) { setGpxError(built.errors.join(" ; ")); return; }
    setGpxError(null);
    setGpxUploading(role ?? stageId);
    try {
      const path = buildGpxPath(userId, roadbookId, scope, role, stageId) + `-${file.name}`;
      await uploadGpx(supabase, GPX_BUCKET, path, file, {
        record: { ...built.record, file_name: file.name, mime_type: "application/gpx+xml", uploaded_by: userId },
      });
      await reloadGpx();
    } catch (err) { setGpxError(err.message); }
    finally { setGpxUploading(null); }
  }, [supabase, roadbookId, userId, reloadGpx]);

  const replaceGpx = useCallback(async (file, mediaRow, { scope, role, stageId }) => {
    const valErr = validateGpx(file);
    if (valErr) { setGpxError(valErr); return; }
    const built = buildCanonicalGpxMediaInput({ roadbookId: Number(roadbookId), scope, role, stageId, existingMetadata: { ...mediaRow.metadata, original_name: file.name, original_size: file.size } });
    if (!built.ok) { setGpxError(built.errors.join(" ; ")); return; }
    setGpxError(null);
    setGpxUploading(role ?? stageId);
    try {
      await uploadGpx(supabase, GPX_BUCKET, mediaRow.path, file, { upsert: true });
      await updateGpxRecord(supabase, mediaRow.id, { file_name: file.name, metadata: built.record.metadata });
      await reloadGpx();
    } catch (err) { setGpxError(err.message); }
    finally { setGpxUploading(null); }
  }, [supabase, roadbookId, reloadGpx]);

  const deleteGpx = useCallback(async (mediaRow) => {
    setGpxUploading("delete");
    try {
      await deleteGpxWriter(supabase, mediaRow, GPX_BUCKET);
      await reloadGpx();
    } catch (err) { setGpxError(err.message); }
    finally { setGpxUploading(null); }
  }, [supabase, reloadGpx]);

  const downloadGpx = useCallback(async (mediaRow) => {
    try {
      const signedUrl = await getSignedUrl(supabase, GPX_BUCKET, mediaRow.path, 3600);
      if (!signedUrl) return;
      const a = document.createElement("a"); a.href = signedUrl; a.download = mediaRow.file_name; a.click();
    } catch (err) {
      setGpxError(`Impossible de télécharger le GPX : ${err.message}`);
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
      const hours = estimateGpxHours(metrics.distanceKm, metrics.elevationGainM);
      const durationStr = formatDuration(hours);

      const existingDist = stage.distance_km != null;
      const existingGain = stage.elevation_gain_m != null;
      const existingLoss = stage.elevation_loss_m != null;
      const existingDuration = stage.duration != null;
      const anyExisting = existingDist || existingGain || existingLoss || existingDuration;

      const result = { metrics, durationStr, stage, anyExisting };
      return result;
    } catch (err) {
      setGpxError(err.message ?? String(err));
      return null;
    } finally {
      setMetricsLoading(null);
    }
  }, [supabase]);

  const analyzeStageGpx = useCallback(async (gpx, stage) => {
    if (!gpx || !stage) return null;
    try {
      const signedUrl = await getSignedUrl(supabase, GPX_BUCKET, gpx.path, 3600);
      if (!signedUrl) return { error: "URL signée indisponible", stageNumber: stage.stage_number };
      const metrics = await fetchAndComputeGpxMetrics(signedUrl);
      const hours = estimateGpxHours(metrics.distanceKm, metrics.elevationGainM);
      const durationStr = formatDuration(hours);
      return { metrics, durationStr, stage, error: null };
    } catch (err) {
      return { error: err.message, stageNumber: stage.stage_number };
    }
  }, [supabase]);

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
      setGpxError(err.message ?? String(err));
      return false;
    }
  }, [supabase, reloadStages]);

  return {
    gpxOfficial, setGpxOfficial, gpxCustom, setGpxCustom, gpxByStage, setGpxByStage,
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
