import { useCallback, useEffect, useState } from "react";
import { loadCoverMedia, getSignedUrl } from "@/lib/roadbooks/loaders";
import { mergeRemoteStagesIntoDraft } from "@/lib/roadbooks/stage-order";

export default function useLoadData({
  user, id, supabase, loadAll,
  setTitle, setDescription, setIsPublic,
  setActivity, setDestination, setProject,
  setCoverUrl, setCoverMediaId, setCoverPreview, setCoverMode,
  setFetchError,
  loadEnrichmentIndices, reloadMedia, reloadGpx,
  setRoadbook, setStages, setPoisByStage, setVariantsByStage,
  setImages, setGpxOfficial, setGpxCustom, setGpxByStage, setGpxByVariant,
  setStartPoint,
}) {
  const [officialRoute, setOfficialRoute] = useState({ officialDist: "", officialGain: "", officialLoss: "", officialGpx: "", officialMap: "" });
  const [traceRoute, setTraceRoute] = useState({ traceDist: "", traceGain: "", traceLoss: "", traceGpx: "", traceMap: "" });

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const data = await loadAll();
        if (!data) return;
        setTitle(data.title);
        setDescription(data.description ?? "");
        setIsPublic(data.is_public);
        setActivity(data.metadata?.activity ?? "");
        setDestination(data.metadata?.destination ?? "");
        setProject(data.metadata?.project ?? "");
        const meta = data.metadata ?? {};
        const o = meta.official ?? {};
        setOfficialRoute({
          officialDist: o.distance != null ? String(o.distance) : "",
          officialGain: o.elevationGain != null ? String(o.elevationGain) : "",
          officialLoss: o.elevationLoss != null ? String(o.elevationLoss) : "",
          officialGpx: o.gpx ?? "",
          officialMap: o.mapEmbedUrl ?? "",
        });
        const st = meta.stagesTotal ?? {};
        setTraceRoute({
          traceDist: st.distance != null ? String(st.distance) : (data.distance_km != null ? String(data.distance_km) : ""),
          traceGain: st.elevationGain != null ? String(st.elevationGain) : (data.elevation_gain_m != null ? String(data.elevation_gain_m) : ""),
          traceLoss: st.elevationLoss != null ? String(st.elevationLoss) : (data.elevation_loss_m != null ? String(data.elevation_loss_m) : ""),
          traceGpx: st.gpx ?? "",
          traceMap: st.mapEmbedUrl ?? "",
        });
        setCoverUrl(data.cover_image_url ?? "");
        setCoverMediaId(data.cover_media_id ?? null);
        if (data.cover_image_url) { setCoverMode("url"); setCoverPreview(data.cover_image_url); }
        else if (data.cover_media_id) {
          setCoverMode("media"); setCoverPreview(null);
          try {
            const m = await loadCoverMedia(supabase, data.cover_media_id);
            if (m) { const s = await getSignedUrl(supabase, m.bucket, m.path, 3600); if (s) setCoverPreview(s); }
          } catch (err) {
            setFetchError(`Couverture inaccessible : ${err.message}`);
          }
        } else { setCoverMode(null); setCoverPreview(null); }
        loadEnrichmentIndices();
        reloadMedia();
        reloadGpx();
      } catch (err) { setFetchError(err.message); }
    })();
  }, [user?.id, id]);

  const restoreDraft = useCallback((draft) => {
    if (!draft) return;
    const p = draft;
    if (p.title != null) setTitle(p.title);
    if (p.description != null) setDescription(p.description);
    if (p.isPublic != null) setIsPublic(p.isPublic);
    if (p.activity != null) setActivity(p.activity);
    if (p.destination != null) setDestination(p.destination);
    if (p.project != null) setProject(p.project);
    if (p.roadbook) setRoadbook(p.roadbook);
    if (p.stages) setStages(remoteStages => mergeRemoteStagesIntoDraft(remoteStages, p.stages));
    if (p.poisByStage) setPoisByStage(p.poisByStage);
    if (p.variantsByStage) setVariantsByStage(p.variantsByStage);
    if (p.images) setImages(p.images);
    if (p.gpxOfficial !== undefined) setGpxOfficial(p.gpxOfficial);
    if (p.gpxCustom !== undefined) setGpxCustom(p.gpxCustom);
    if (p.gpxByStage) setGpxByStage(p.gpxByStage);
    if (p.gpxByVariant) setGpxByVariant(p.gpxByVariant);
    if (p.officialDist != null || p.officialGain != null || p.officialLoss != null || p.officialGpx != null || p.officialMap != null) setOfficialRoute(prev => ({ ...prev, ...(p.officialDist != null ? { officialDist: p.officialDist } : {}), ...(p.officialGain != null ? { officialGain: p.officialGain } : {}), ...(p.officialLoss != null ? { officialLoss: p.officialLoss } : {}), ...(p.officialGpx != null ? { officialGpx: p.officialGpx } : {}), ...(p.officialMap != null ? { officialMap: p.officialMap } : {}) }));
    if (p.traceDist != null || p.traceGain != null || p.traceLoss != null || p.traceGpx != null || p.traceMap != null) setTraceRoute(prev => ({ ...prev, ...(p.traceDist != null ? { traceDist: p.traceDist } : {}), ...(p.traceGain != null ? { traceGain: p.traceGain } : {}), ...(p.traceLoss != null ? { traceLoss: p.traceLoss } : {}), ...(p.traceGpx != null ? { traceGpx: p.traceGpx } : {}), ...(p.traceMap != null ? { traceMap: p.traceMap } : {}) }));
    if (p.coverMode !== undefined) setCoverMode(p.coverMode);
    if (p.coverUrl != null) setCoverUrl(p.coverUrl);
    if (p.coverMediaId !== undefined) setCoverMediaId(p.coverMediaId);
    if (p.startPoint) setStartPoint(p.startPoint);
  }, [setTitle, setDescription, setIsPublic, setActivity, setDestination, setProject, setRoadbook, setStages, setPoisByStage, setVariantsByStage, setImages, setGpxOfficial, setGpxCustom, setGpxByStage, setGpxByVariant, setCoverMode, setCoverUrl, setCoverMediaId, setStartPoint]);

  return { officialRoute, setOfficialRoute, traceRoute, setTraceRoute, restoreDraft };
}
