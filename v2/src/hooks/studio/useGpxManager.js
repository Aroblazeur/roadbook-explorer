import { useCallback, useState } from "react";
import { fetchAndComputeGpxMetrics, estimateGpxHours, formatDuration } from "@/lib/gpx-metrics";
import { loadGpxRows, getSignedUrl } from "@/lib/roadbooks/loaders";
import { uploadGpx, insertGpxRecord, updateGpxRecord, deleteGpx as deleteGpxWriter } from "@/lib/roadbooks/writers";
import { buildGpxPath, validateGpx } from "@/lib/roadbooks/validators";

const GPX_BUCKET = "roadbook-gpx";

export function useGpxManager({ supabase, roadbookId, userId }) {
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
      const official = rows.find(r => r.metadata?.gpx_role === "official");
      const custom = rows.find(r => r.metadata?.gpx_role === "custom");
      setGpxOfficial(official ?? null);
      setGpxCustom(custom ?? null);
      const byStage = {};
      rows.filter(r => r.metadata?.scope === "stage" && r.stage_id).forEach(r => { byStage[r.stage_id] = r; });
      setGpxByStage(byStage);
    } catch {}
  }, [supabase, roadbookId, userId]);

  const uploadGpx = useCallback(async (file, { scope, role, stageId }) => {
    const valErr = validateGpx(file);
    if (valErr) { setGpxError(valErr); return; }
    setGpxError(null);
    setGpxUploading(role ?? stageId);
    try {
      const path = buildGpxPath(userId, roadbookId, scope, role, stageId) + `-${file.name}`;
      await uploadGpx(supabase, GPX_BUCKET, path, file);
      const meta = { scope, original_name: file.name, original_size: file.size };
      if (role) meta.gpx_role = role;
      await insertGpxRecord(supabase, {
        roadbook_id: Number(roadbookId), stage_id: scope === "stage" ? stageId : null, type: "gpx",
        bucket: GPX_BUCKET, path, file_name: file.name, mime_type: "application/gpx+xml",
        uploaded_by: userId, metadata: meta,
      });
      await reloadGpx();
    } catch (err) { setGpxError(err.message); }
    finally { setGpxUploading(null); }
  }, [supabase, roadbookId, userId, reloadGpx]);

  const replaceGpx = useCallback(async (file, mediaRow, { scope, role, stageId }) => {
    const valErr = validateGpx(file);
    if (valErr) { setGpxError(valErr); return; }
    setGpxError(null);
    setGpxUploading(role ?? stageId);
    try {
      const path = buildGpxPath(userId, roadbookId, scope, role, stageId) + `-${file.name}`;
      await uploadGpx(supabase, GPX_BUCKET, path, file);
      const meta = { ...mediaRow.metadata, original_name: file.name, original_size: file.size };
      await updateGpxRecord(supabase, mediaRow.id, { path, file_name: file.name, metadata: meta });
      await reloadGpx();
    } catch (err) { setGpxError(err.message); }
    finally { setGpxUploading(null); }
  }, [supabase, roadbookId, userId, reloadGpx]);

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
    } catch {}
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

  return {
    gpxOfficial, gpxCustom, gpxByStage,
    gpxUploading, metricsLoading,
    gpxError, setGpxError,
    reloadGpx,
    uploadGpx,
    replaceGpx,
    deleteGpx,
    downloadGpx,
    computeStageMetrics,
    GPX_BUCKET,
  };
}
