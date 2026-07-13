"use client";

import { useAuth } from "@/lib/auth-context";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { findPoi, findAccommodation, findAccommodationByName } from "@/lib/enrichment";
import { useNotifications } from "@/hooks/studio/useNotifications";
import { useRoadbookData } from "@/hooks/studio/useRoadbookData";
import { useMediaManager } from "@/hooks/studio/useMediaManager";
import { useGpxManager } from "@/hooks/studio/useGpxManager";
import { useCoverManager } from "@/hooks/studio/useCoverManager";
import { useEnrichment } from "@/hooks/studio/useEnrichment";
import { useSaveWithLock } from "@/hooks/studio/useSaveWithLock";
import { useStageCrud } from "@/hooks/studio/useStageCrud";
import { useStudioDraft } from "@/hooks/useStudioDraft";
import DraftStatus from "@/components/DraftStatus";
import GeneralInfoForm from "@/components/studio/GeneralInfoForm";
import RouteForm from "@/components/studio/RouteForm";
import CoverSection from "@/components/studio/CoverSection";
import MediaSection from "@/components/studio/MediaSection";
import GpxSection from "@/components/studio/GpxSection";
import AutomationPanel from "@/components/studio/AutomationPanel";
import StageForm from "@/components/studio/StageForm";
import StageCard from "@/components/studio/StageCard";
import { conditionalUpdateRoadbook } from "@/lib/sync-helpers";
import { exportDraftToJSON, downloadDraftExport } from "@/lib/studio-drafts";
import { loadCoverMedia, getSignedUrl } from "@/lib/roadbooks/loaders";
import { insertRoadbook, duplicateRoadbook } from "@/lib/roadbooks/writers";
import { applyPoiEnrichment, applyAccommodationEnrichment } from "@/lib/roadbooks/enrich";

export default function RoadbookDetailPage() {
  const { user, loading: authLoading, supabase } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const {
    roadbook, setRoadbook,
    stages, setStages,
    poisByStage, setPoisByStage,
    variantsByStage, setVariantsByStage,
    loading, fetchError,
    loadAll,
    reloadStages,
    reloadPoisVariants,
  } = useRoadbookData({ supabase, roadbookId: id, user, enabled: !authLoading && !!user && !!id });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const { error, setError, success, setSuccess } = useNotifications();

  const { saveWithLock, saving } = useSaveWithLock({
    supabase, id, tabId,
    roadbook, stages, poisByStage, variantsByStage,
    setRoadbook,
    onError: setError, onSuccess: setSuccess,
    markRemoteConflict, markSynced, saveImmediate,
  });
  const [activity, setActivity] = useState("");
  const [destination, setDestination] = useState("");
  const [project, setProject] = useState("");

  const {
    stageForm, stageFormDispatch,
    stageError, stageSuccess, setStageError, setStageSuccess,
    editingStage,
    deleting,
    clearStageForm,
    fillStageForm,
    handleStageSubmit,
    handleDeleteStage,

    poiForm, setPoiForm, clearPoiForm,
    handlePoiSubmit, handleDeletePoi,

    variantForm, setVariantForm, clearVariantForm,
    handleVariantSubmit, handleDeleteVariant,

    noteForm, setNoteForm, clearNoteForm,
    handleNoteSubmit, handleDeleteNote,

    accommodationForm, setAccommodationForm, clearAccommodationForm,
    handleAccommodationSubmit, handleClearAccommodation,

    handleMoveStage,
  } = useStageCrud({
    supabase, roadbookId: id,
    stages, setStages,
    reloadPoisVariants,
    reloadStages,
  });

  const [expandedStages, setExpandedStages] = useState({});

  const {
    images, setImages,
    uploadLoading,
    deleteLoading,
    uploadError, setUploadError,
    reloadMedia,
    uploadMedia,
    removeMedia,
    handleSignedUrl,
  } = useMediaManager({ supabase, roadbookId: id, userId: user?.id });

  const {
    gpxOfficial, gpxCustom, gpxByStage,
    gpxUploading, metricsLoading,
    gpxError, setGpxError,
    reloadGpx,
    uploadGpx: uploadGpxFile,
    replaceGpx,
    deleteGpx,
    downloadGpx,
    computeStageMetrics,
    applyStageMetrics,
    analyzeStageGpx,
  } = useGpxManager({ supabase, roadbookId: id, userId: user?.id, reloadStages });

  const {
    coverUrl, setCoverUrl,
    coverMediaId, setCoverMediaId,
    coverPreview, setCoverPreview,
    coverMode, setCoverMode,
    setCoverFromMedia,
    setCoverFromUrl,
    removeCover,
  } = useCoverManager({ supabase, roadbookId: id, roadbook, setRoadbook, onError: setError, onSuccess: setSuccess });

  const {
    poiIndex, accommodationIndex,
    enrichmentError, setEnrichmentError,
    enrichingPoi, enrichingAccommodation,
    automationBusy, setAutomationBusy,
    automationResult, setAutomationResult,
    loadEnrichmentIndices,
    enrichPoi,
    enrichAccommodation,
    recalculateTotals,
    reloadAfterEnrichment,
  } = useEnrichment({
    supabase, roadbook, setRoadbook, stages, setStages, poisByStage, setPoisByStage,
    onSuccess: setStageSuccess, onError: setError,
    reloadPoisVariants,
    reloadStages,
  });

  const [duplicating, setDuplicating] = useState(false);
  const [showStageForm, setShowStageForm] = useState(false);

  const [officialRoute, setOfficialRoute] = useState({ officialDist: "", officialGain: "", officialLoss: "", officialGpx: "", officialMap: "" });
  const [traceRoute, setTraceRoute] = useState({ traceDist: "", traceGain: "", traceLoss: "", traceGpx: "", traceMap: "" });

  const {
    draftStatus,
    draftError,
    restoredInfo,
    restoredDraft,
    saveImmediate,
    markSynced,
    markRemoteConflict,
    dismissConflict,
    clearDraft,
    resetRestoredInfo,
    tabId,
  } = useStudioDraft({
    user,
    roadbookId: id,
    roadbook,
    stages,
    poisByStage,
    variantsByStage,
    images,
    gpxOfficial,
    gpxCustom,
    gpxByStage,
    title,
    description,
    isPublic,
    activity,
    destination,
    project,
    ...officialRoute,
    ...traceRoute,
    coverMode,
    coverUrl,
    coverMediaId,
    loaded: !loading && !!roadbook,
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading]);

  async function loadData() {
    if (!user || !id) return;
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
      const official = meta.official ?? {};
      setOfficialRoute({
        officialDist: official.distance != null ? String(official.distance) : "",
        officialGain: official.elevationGain != null ? String(official.elevationGain) : "",
        officialLoss: official.elevationLoss != null ? String(official.elevationLoss) : "",
        officialGpx: official.gpx ?? "",
        officialMap: official.mapEmbedUrl ?? "",
      });
      const stagesTotal = meta.stagesTotal ?? {};
      setTraceRoute({
        traceDist: stagesTotal.distance != null ? String(stagesTotal.distance) : (data.distance_km != null ? String(data.distance_km) : ""),
        traceGain: stagesTotal.elevationGain != null ? String(stagesTotal.elevationGain) : (data.elevation_gain_m != null ? String(data.elevation_gain_m) : ""),
        traceLoss: stagesTotal.elevationLoss != null ? String(stagesTotal.elevationLoss) : (data.elevation_loss_m != null ? String(data.elevation_loss_m) : ""),
        traceGpx: stagesTotal.gpx ?? "",
        traceMap: stagesTotal.mapEmbedUrl ?? "",
      });
      setCoverUrl(data.cover_image_url ?? "");
      setCoverMediaId(data.cover_media_id ?? null);
      if (data.cover_image_url) { setCoverMode("url"); setCoverPreview(data.cover_image_url); }
      else if (data.cover_media_id) {
        setCoverMode("media"); setCoverPreview(null);
        try {
          const m = await loadCoverMedia(supabase, data.cover_media_id);
          if (m) {
            const signedUrl = await getSignedUrl(supabase, m.bucket, m.path, 86400);
            if (signedUrl) setCoverPreview(signedUrl);
          }
        } catch {}
      } else { setCoverMode(null); setCoverPreview(null); }

      loadEnrichmentIndices();

      reloadMedia();
      reloadGpx();
    } catch (err) {
      setFetchError(err.message);
    }
  }

  useEffect(() => { loadData(); }, [user, id]);

  useEffect(() => {
    if (!restoredDraft) return;
    const p = restoredDraft;
    if (p.title != null) setTitle(p.title);
    if (p.description != null) setDescription(p.description);
    if (p.isPublic != null) setIsPublic(p.isPublic);
    if (p.activity != null) setActivity(p.activity);
    if (p.destination != null) setDestination(p.destination);
    if (p.project != null) setProject(p.project);
    if (p.roadbook) setRoadbook(p.roadbook);
    if (p.stages) setStages(p.stages);
    if (p.poisByStage) setPoisByStage(p.poisByStage);
    if (p.variantsByStage) setVariantsByStage(p.variantsByStage);
    if (p.images) setImages(p.images);
    if (p.gpxOfficial !== undefined) setGpxOfficial(p.gpxOfficial);
    if (p.gpxCustom !== undefined) setGpxCustom(p.gpxCustom);
    if (p.gpxByStage) setGpxByStage(p.gpxByStage);
    if (p.officialDist != null || p.officialGain != null || p.officialLoss != null || p.officialGpx != null || p.officialMap != null) {
      setOfficialRoute(prev => ({
        ...prev,
        ...(p.officialDist != null ? { officialDist: p.officialDist } : {}),
        ...(p.officialGain != null ? { officialGain: p.officialGain } : {}),
        ...(p.officialLoss != null ? { officialLoss: p.officialLoss } : {}),
        ...(p.officialGpx != null ? { officialGpx: p.officialGpx } : {}),
        ...(p.officialMap != null ? { officialMap: p.officialMap } : {}),
      }));
    }
    if (p.traceDist != null || p.traceGain != null || p.traceLoss != null || p.traceGpx != null || p.traceMap != null) {
      setTraceRoute(prev => ({
        ...prev,
        ...(p.traceDist != null ? { traceDist: p.traceDist } : {}),
        ...(p.traceGain != null ? { traceGain: p.traceGain } : {}),
        ...(p.traceLoss != null ? { traceLoss: p.traceLoss } : {}),
        ...(p.traceGpx != null ? { traceGpx: p.traceGpx } : {}),
        ...(p.traceMap != null ? { traceMap: p.traceMap } : {}),
      }));
    }
    if (p.coverMode !== undefined) setCoverMode(p.coverMode);
    if (p.coverUrl != null) setCoverUrl(p.coverUrl);
    if (p.coverMediaId !== undefined) setCoverMediaId(p.coverMediaId);
  }, [restoredDraft]);

  async function handleSave(e) {
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
  }

  async function handleSaveRoute(e) {
    e.preventDefault();
    const meta = { ...(roadbook?.metadata ?? {}) };
    meta.official = {
      distance: officialRoute.officialDist ? Number(officialRoute.officialDist) : null,
      elevationGain: officialRoute.officialGain ? Number(officialRoute.officialGain) : null,
      elevationLoss: officialRoute.officialLoss ? Number(officialRoute.officialLoss) : null,
      gpx: officialRoute.officialGpx || null,
      mapEmbedUrl: officialRoute.officialMap || null,
    };
    meta.stagesTotal = {
      distance: traceRoute.traceDist ? Number(traceRoute.traceDist) : null,
      elevationGain: traceRoute.traceGain ? Number(traceRoute.traceGain) : null,
      elevationLoss: traceRoute.traceLoss ? Number(traceRoute.traceLoss) : null,
      gpx: traceRoute.traceGpx || null,
      mapEmbedUrl: traceRoute.traceMap || null,
    };
    const updateFields = {
      distance_km: traceRoute.traceDist ? Number(traceRoute.traceDist) : null,
      elevation_gain_m: traceRoute.traceGain ? Number(traceRoute.traceGain) : null,
      elevation_loss_m: traceRoute.traceLoss ? Number(traceRoute.traceLoss) : null,
    };
    await saveWithLock({
      getUpdateFields: () => ({ metadata: meta, ...updateFields }),
      getUpdatedRoadbook: (prev, data) => ({ ...prev, metadata: meta, ...updateFields, updated_at: data.updated_at }),
      successMessage: "Itinéraire et tracé mis à jour.",
    });
  }

  async function handleToggleVisibility() {
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
  }



  async function handleUploadImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadMedia(file);
    e.target.value = "";
  }

  async function handleDeleteImage(mediaRow) {
    if (!window.confirm("Supprimer cette image ?")) return;
    await removeMedia(mediaRow);
  }

  async function handleGpxDownload(mediaRow) {
    await downloadGpx(mediaRow);
  }

  async function handleGpxReplace(mediaRow, scope, role, stageId) {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".gpx";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      await replaceGpx(file, mediaRow, { scope, role, stageId });
    };
    input.click();
  }

  async function handleGpxUpload(scope, role, stageId) {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".gpx";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      await uploadGpxFile(file, { scope, role, stageId });
    };
    input.click();
  }

  async function handleComputeFromGpx(mediaRow, stage) {
    if (!mediaRow || !stage) return;
    setStageError(null);
    const result = await computeStageMetrics(mediaRow, stage);
    if (!result) return;
    const { metrics, durationStr, anyExisting } = result;

    if (anyExisting) {
      const msgParts = [];
      if (stage.distance_km != null) msgParts.push(`distance (${stage.distance_km} km)`);
      if (stage.elevation_gain_m != null) msgParts.push(`D+ (${stage.elevation_gain_m} m)`);
      if (stage.elevation_loss_m != null) msgParts.push(`D− (${stage.elevation_loss_m} m)`);
      if (stage.duration) msgParts.push(`durée (${stage.duration})`);

      const ok = window.confirm(
        `Cette étape a déjà des valeurs de ${msgParts.join(", ")}.\n\n`
        + `Nouvelles valeurs calculées :\n`
        + `• Distance : ${metrics.distanceKm.toFixed(1)} km\n`
        + `• D+ : ${metrics.elevationGainM != null ? Math.round(metrics.elevationGainM) + " m" : "N/A"}\n`
        + `• D− : ${metrics.elevationLossM != null ? Math.round(metrics.elevationLossM) + " m" : "N/A"}\n`
        + `• Durée : ${durationStr || "N/A"}\n\n`
        + `Écraser les valeurs existantes ?`
      );
      if (!ok) return;
    }

    const ok = await applyStageMetrics(metrics, durationStr, stage);
    if (ok) {
      setStageSuccess(`Étape mise à jour depuis le GPX : ${metrics.distanceKm.toFixed(1)} km`
        + (metrics.elevationGainM != null ? `, D+ ${Math.round(metrics.elevationGainM)} m` : "")
        + (metrics.elevationLossM != null ? `, D− ${Math.round(metrics.elevationLossM)} m` : "")
        + (durationStr ? `, ${durationStr}` : "")
      );
    }
  }

  async function handleEnrichPoi(poi, stageId) {
    await enrichPoi(poi);
  }


  // --- Automations ---

  async function handleRecalculateTotals() {
    if (!stages.length) { setAutomationResult("Aucune étape à analyser."); return; }
    let totalDist = 0, totalGain = 0, totalLoss = 0;
    let hasDist = false, hasGain = false, hasLoss = false;
    stages.forEach(s => {
      if (s.distance_km != null) { totalDist += Number(s.distance_km); hasDist = true; }
      if (s.elevation_gain_m != null) { totalGain += Number(s.elevation_gain_m); hasGain = true; }
      if (s.elevation_loss_m != null) { totalLoss += Number(s.elevation_loss_m); hasLoss = true; }
    });

    if (!hasDist && !hasGain && !hasLoss) {
      setAutomationResult("Aucune métrique disponible dans les étapes pour calculer les totaux.");
      return;
    }

    const summaryParts = [`${stages.length} étape(s)`];
    if (hasDist) summaryParts.push(`distance totale : ${totalDist.toFixed(1)} km`);
    if (hasGain) summaryParts.push(`D+ total : ${Math.round(totalGain)} m`);
    if (hasLoss) summaryParts.push(`D− total : ${Math.round(totalLoss)} m`);

    const ok = window.confirm(
      `Totaux calculés sur ${stages.length} étape(s) :\n\n`
      + (hasDist ? `• Distance : ${totalDist.toFixed(1)} km\n` : "")
      + (hasGain ? `• D+ : ${Math.round(totalGain)} m\n` : "")
      + (hasLoss ? `• D− : ${Math.round(totalLoss)} m\n` : "")
      + `\nAppliquer ces totaux au roadbook ?`
    );
    if (!ok) return;

    const updateFields = {};
    if (hasDist) updateFields.distance_km = Math.round(totalDist * 100) / 100;
    if (hasGain) updateFields.elevation_gain_m = Math.round(totalGain);
    if (hasLoss) updateFields.elevation_loss_m = Math.round(totalLoss);

    setAutomationBusy("totals");
    setAutomationResult(null);
    try {
      const result = await recalculateTotals(updateFields);
      setAutomationResult(result.msg);
    } catch (err) { setAutomationResult(`Erreur : ${err.message}`); }
    finally { setAutomationBusy(null); }
  }

  async function handleAnalyzeStageGpx() {
    setAutomationBusy("gpx");
    setAutomationResult(null);
    const report = { analyzed: 0, updated: 0, errors: [] };
    try {
      const stats = stages.map(s => ({ stage: s, gpx: gpxByStage[s.id] ?? null }));
      const withGpx = stats.filter(s => s.gpx);
      if (!withGpx.length) {
        setAutomationResult("Aucune étape avec GPX. Importez un GPX d'étape d'abord.");
        setAutomationBusy(null); return;
      }

      const previewLines = ["Étapes avec GPX détectées :"];
      for (const { stage } of withGpx) {
        const has = [];
        if (stage.distance_km != null) has.push(`dist=${stage.distance_km}km`);
        if (stage.elevation_gain_m != null) has.push(`D+=${stage.elevation_gain_m}m`);
        if (stage.elevation_loss_m != null) has.push(`D−=${stage.elevation_loss_m}m`);
        if (stage.duration) has.push(`durée=${stage.duration}`);
        previewLines.push(`  • Jour ${stage.stage_number}${stage.title ? ` — ${stage.title}` : ""}${has.length ? ` [actuel : ${has.join(", ")}]` : ""}`);
      }
      previewLines.push(`\n${withGpx.length} étape(s) seront recalculées depuis leur GPX.`);
      previewLines.push("Les valeurs existantes seront écrasées après confirmation individuelle.");
      if (!window.confirm(previewLines.join("\n") + "\n\nContinuer ?")) { setAutomationBusy(null); return; }

      for (const { stage, gpx } of withGpx) {
        report.analyzed++;
        const result = await analyzeStageGpx(gpx, stage);
        if (!result || result.error) {
          report.errors.push(`Jour ${stage.stage_number} : ${result?.error || "Erreur inconnue"}`);
          continue;
        }
        const { metrics, durationStr } = result;

        const existing = [];
        if (stage.distance_km != null) existing.push(`distance (${stage.distance_km} km)`);
        if (stage.elevation_gain_m != null) existing.push(`D+ (${stage.elevation_gain_m} m)`);
        if (stage.elevation_loss_m != null) existing.push(`D− (${stage.elevation_loss_m} m)`);
        if (stage.duration) existing.push(`durée (${stage.duration})`);

        const msg = existing.length
          ? `Jour ${stage.stage_number} — valeurs existantes : ${existing.join(", ")}.\n\nNouvelles valeurs calculées :\n• Distance : ${metrics.distanceKm.toFixed(1)} km\n• D+ : ${metrics.elevationGainM != null ? Math.round(metrics.elevationGainM) + " m" : "N/A"}\n• D− : ${metrics.elevationLossM != null ? Math.round(metrics.elevationLossM) + " m" : "N/A"}\n• Durée : ${durationStr || "N/A"}\n\nÉcraser ?`
          : `Jour ${stage.stage_number} — aucune valeur existante.\n\nValeurs calculées :\n• Distance : ${metrics.distanceKm.toFixed(1)} km\n• D+ : ${metrics.elevationGainM != null ? Math.round(metrics.elevationGainM) + " m" : "N/A"}\n• D− : ${metrics.elevationLossM != null ? Math.round(metrics.elevationLossM) + " m" : "N/A"}\n• Durée : ${durationStr || "N/A"}\n\nAppliquer ?`;

        if (!window.confirm(msg)) continue;

        const saved = await applyStageMetrics(metrics, durationStr, stage);
        if (saved) report.updated++;
      }

      let msg = `Analyse terminée : ${report.analyzed} analysée(s), ${report.updated} mise(s) à jour.`;
      if (report.errors.length) msg += `\nErreurs :\n${report.errors.map(e => `  • ${e}`).join("\n")}`;
      setAutomationResult(msg);
    } catch (err) { setAutomationResult(`Erreur : ${err.message}`); }
    finally { setAutomationBusy(null); }
  }

  async function handleAutoEnrich() {
    setAutomationBusy("enrich");
    setAutomationResult(null);
    const report = { poisFound: 0, poisUpdated: 0, accomsFound: 0, accomsUpdated: 0, errors: [] };
    try {
      if (!poiIndex && !accommodationIndex) {
        setAutomationResult("Aucune donnée d'enrichissement disponible pour ce roadbook.");
        setAutomationBusy(null); return;
      }

      const allPois = Object.values(poisByStage).flat();
      const enrichablePois = poiIndex ? allPois.filter(p => findPoi(p.name, poiIndex)) : [];
      const enrichableAccoms = accommodationIndex
        ? stages.filter(s => {
            if (!s.accommodation_name && !s.accommodation_url) return false;
            const byUrl = s.accommodation_url ? findAccommodation(s.accommodation_url, accommodationIndex) : null;
            if (byUrl) return true;
            return s.accommodation_name ? !!findAccommodationByName(s.accommodation_name, accommodationIndex) : false;
          })
        : [];

      if (!enrichablePois.length && !enrichableAccoms.length) {
        setAutomationResult("Aucun POI ou hébergement enrichissable trouvé.");
        setAutomationBusy(null); return;
      }

      const lines = [];
      if (enrichablePois.length) lines.push(`POI enrichissables : ${enrichablePois.length}`);
      if (enrichableAccoms.length) lines.push(`Hébergements enrichissables : ${enrichableAccoms.length}`);
      lines.push("\nLes champs déjà renseignés seront proposés avec confirmation individuelle.");
      if (!window.confirm(lines.join("\n") + "\n\nContinuer ?")) { setAutomationBusy(null); return; }

      for (const poi of enrichablePois) {
        try {
          report.poisFound++;
          const found = findPoi(poi.name, poiIndex);
          if (!found) continue;
          const existing = [];
          if (poi.description) existing.push("description");
          if (poi.lat != null) existing.push("coordonnées");
          if (poi.link_url) existing.push("lien");
          const promptLines = [`POI "${poi.name}"`];
          if (existing.length) promptLines.push(`Valeurs existantes : ${existing.join(", ")}`);
          promptLines.push(`\nNouvelles valeurs proposées :\n• Description : ${found.description || "N/A"}\n• Coordonnées : ${found.coordinates ? `${found.coordinates.lat}, ${found.coordinates.lng}` : "N/A"}\n• Image : ${found.image || "N/A"}\n• Lien : ${found.url || "N/A"}`);
          promptLines.push(`\n${existing.length ? "Écraser ?" : "Appliquer ?"}`);
          if (!window.confirm(promptLines.join("\n"))) continue;
          const result = await applyPoiEnrichment(supabase, poi.id, found);
          if (result.updated) report.poisUpdated++;
        } catch (err) { report.errors.push(`POI "${poi.name}" : ${err.message}`); }
      }

      for (const stage of enrichableAccoms) {
        try {
          report.accomsFound++;
          const url = stage.accommodation_url;
          const name = stage.accommodation_name;
          let found = url ? findAccommodation(url, accommodationIndex) : null;
          if (!found && name) found = findAccommodationByName(name, accommodationIndex);
          if (!found) continue;
          const existing = [];
          if (stage.accommodation_name) existing.push("nom");
          if (stage.accommodation_photo) existing.push("photo");
          const promptLines = [`Hébergement "${name || url}"`];
          if (existing.length) promptLines.push(`Valeurs existantes : ${existing.join(", ")}`);
          promptLines.push(`\nNouvelles valeurs proposées :\n• Nom : ${found.name || "N/A"}\n• Image : ${found.image || "N/A"}`);
          promptLines.push(`\n${existing.length ? "Écraser ?" : "Appliquer ?"}`);
          if (!window.confirm(promptLines.join("\n"))) continue;
          const result = await applyAccommodationEnrichment(supabase, stage.id, found);
          if (result.updated) report.accomsUpdated++;
        } catch (err) { report.errors.push(`Hébergement "${name}" : ${err.message}`); }
      }

      let msg = `Enrichissement terminé : ${report.poisUpdated}/${report.poisFound} POI, ${report.accomsUpdated}/${report.accomsFound} hébergements mis à jour.`;
      if (report.errors.length) msg += `\nErreurs :\n${report.errors.map(e => `  • ${e}`).join("\n")}`;
      setAutomationResult(msg);
      await reloadAfterEnrichment();
    } catch (err) { setAutomationResult(`Erreur : ${err.message}`); }
    finally { setAutomationBusy(null); }
  }

  async function handleGpxDelete(mediaRow) {
    if (!window.confirm("Supprimer ce GPX ?")) return;
    await deleteGpx(mediaRow);
  }

  // --- Cover image ---
  async function handleSetCoverFromMedia(mediaId) {
    await setCoverFromMedia(mediaId);
  }

  async function handleSetCoverFromUrl(url) {
    await setCoverFromUrl(url);
  }

  async function handleRemoveCover() {
    await removeCover();
  }

  // --- Duplicate ---
  async function handleDuplicate() {
    if (!window.confirm("Dupliquer ce roadbook ? Les fichiers (images, GPX) ne seront pas copiés.")) return;
    setDuplicating(true);
    setError(null);
    try {
      const slug = `${roadbook.slug}-copie-${Date.now()}`;
      const newId = await duplicateRoadbook(supabase, roadbook, stages, poisByStage, variantsByStage, slug, user.id);
      setSuccess("Roadbook dupliqué ! Redirection...");
      setTimeout(() => router.push(`/dashboard/roadbooks/${newId}`), 1000);
    } catch (err) { setError(err.message); }
    finally { setDuplicating(false); }
  }

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (draftStatus === "unsaved") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftStatus]);

  const stageCrud = {
    stageForm, stageFormDispatch, stageError, stageSuccess, editingStage, deleting,
    clearStageForm, fillStageForm, handleStageSubmit, handleDeleteStage,
    setShowStageForm,
    poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi,
    variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant,
    noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote,
    accommodationForm, setAccommodationForm, clearAccommodationForm,
    handleAccommodationSubmit, handleClearAccommodation,
  };
  const gpx = { gpxByStage, gpxUploading, metricsLoading, handleComputeFromGpx, handleGpxDownload, handleGpxReplace, handleGpxDelete, handleGpxUpload };
  const enrich = { poiIndex, handleEnrichPoi, enrichingPoi };

  if (authLoading || loading) return <main className="page-dashboard"><p>Chargement du roadbook...</p></main>;
  if (!user) return null;
  if (fetchError && !roadbook) return <main className="page-dashboard"><h1>Erreur</h1><p className="page-error">{fetchError}</p><Link href="/dashboard/roadbooks">Retour à la liste</Link></main>;

  return (
    <main className="page-dashboard">
      {/* Draft status bar */}
      <DraftStatus
        status={draftStatus}
        error={draftError}
        restoredInfo={restoredInfo}
        onResetInfo={resetRestoredInfo}
        onDismissConflict={dismissConflict}
        onClearDraft={clearDraft}
      />
      {/* Hero header */}
      <div className="studio-hero">
        <div className="studio-hero__info">
          <h1 className="studio-hero__title">{roadbook?.title ?? "Roadbook"}</h1>
          <div className="studio-hero__meta">
            <span className={`studio-badge ${isPublic ? "studio-badge--public" : "studio-badge--private"}`}>
              {isPublic ? "Public" : "Privé"}
            </span>
            {activity && <span className="studio-hero__tag">{activity}</span>}
            {destination && <span className="studio-hero__tag">{destination}</span>}
            {project && <span className="studio-hero__tag">{project}</span>}
          </div>
        </div>
        <div className="studio-hero__actions">
          <Link href="/dashboard/roadbooks" className="terrain-button--secondary studio-action-button--compact">Retour</Link>
          <Link href={`/roadbooks/${roadbook?.slug}`} className="terrain-button--secondary studio-action-button--compact">Voir</Link>
          <button type="button" onClick={handleDuplicate} disabled={duplicating} className="terrain-button--secondary studio-action-button--compact">
            {duplicating ? "..." : "Dupliquer"}
          </button>
          <button type="button" onClick={() => downloadDraftExport(user?.id, id, `${roadbook?.slug ?? "roadbook"}-brouillon.json`)} className="terrain-button--secondary studio-action-button--compact">
            Export brouillon
          </button>
        </div>
      </div>

      {error && <p className="page-error">{error}</p>}
      {success && <p className="page-success">{success}</p>}

      <div className="studio-layout">
        {/* LEFT COLUMN — roadbook cards */}
        <div className="studio-panel">

          <GeneralInfoForm
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            activity={activity} setActivity={setActivity}
            destination={destination} setDestination={setDestination}
            project={project} setProject={setProject}
            handleSave={handleSave}
            saving={saving}
          />

          <CoverSection
            coverUrl={coverUrl} setCoverUrl={setCoverUrl}
            coverPreview={coverPreview}
            images={images}
            coverMode={coverMode} coverMediaId={coverMediaId}
            handleSetCoverFromUrl={handleSetCoverFromUrl}
            handleRemoveCover={handleRemoveCover}
            handleSetCoverFromMedia={handleSetCoverFromMedia}
            handleToggleVisibility={handleToggleVisibility}
            isPublic={isPublic}
          />

          <RouteForm
            mode="official"
            values={{ dist: officialRoute.officialDist, gain: officialRoute.officialGain, loss: officialRoute.officialLoss, gpx: officialRoute.officialGpx, map: officialRoute.officialMap }}
            setValues={fn => setOfficialRoute(p => ({ ...p, officialDist: fn(p).dist, officialGain: fn(p).gain, officialLoss: fn(p).loss, officialGpx: fn(p).gpx, officialMap: fn(p).map }))}
            handleSave={handleSaveRoute}
            saving={saving}
          />

          <RouteForm
            mode="trace"
            values={{ dist: traceRoute.traceDist, gain: traceRoute.traceGain, loss: traceRoute.traceLoss, gpx: traceRoute.traceGpx, map: traceRoute.traceMap }}
            setValues={fn => setTraceRoute(p => ({ ...p, traceDist: fn(p).dist, traceGain: fn(p).gain, traceLoss: fn(p).loss, traceGpx: fn(p).gpx, traceMap: fn(p).map }))}
            handleSave={handleSaveRoute}
            saving={saving}
          />

          <MediaSection
            images={images}
            uploadLoading={uploadLoading}
            uploadError={uploadError}
            handleUploadImage={handleUploadImage}
            handleDeleteImage={handleDeleteImage}
            deleteLoading={deleteLoading}
          />

          <GpxSection
            gpxError={gpxError}
            gpxOfficial={gpxOfficial}
            gpxCustom={gpxCustom}
            gpxUploading={gpxUploading}
            handleGpxDownload={handleGpxDownload}
            handleGpxReplace={handleGpxReplace}
            handleGpxDelete={handleGpxDelete}
            handleGpxUpload={handleGpxUpload}
          />

          <AutomationPanel
            automationResult={automationResult}
            automationBusy={automationBusy}
            handleRecalculateTotals={handleRecalculateTotals}
            handleAnalyzeStageGpx={handleAnalyzeStageGpx}
            handleAutoEnrich={handleAutoEnrich}
          />

          {/* CARD 8 — Informations (discrète) */}
          <div className="studio-card studio-card--muted">
            <dl className="studio-info-grid">
              <dt>Slug</dt><dd><code>{roadbook?.slug}</code></dd>
              <dt>ID</dt><dd><code>{roadbook?.id}</code></dd>
              <dt>Créé le</dt><dd>{roadbook?.created_at ? new Date(roadbook.created_at).toLocaleDateString() : ""}</dd>
            </dl>
          </div>

        </div>

        {/* RIGHT COLUMN — Étapes */}
        <div className="studio-panel">
          <div className="studio-card">
            <div className="studio-card__header">
              <h2>Étapes ({stages.length})</h2>
            </div>
            <div className="studio-card__body">
              {enrichmentError && <p className="page-error">{enrichmentError}</p>}
              {stageSuccess && <p className="page-success">{stageSuccess}</p>}
              {stageError && <p className="page-error">{stageError}</p>}
              {poiIndex === null && accommodationIndex === null && stages.length > 0 && (
                <p className="text-muted" style={{ fontStyle: "italic" }}>Aucune donnée d'enrichissement.</p>
              )}

              <StageForm
                showStageForm={showStageForm}
                setShowStageForm={setShowStageForm}
                stageForm={stageForm}
                stageFormDispatch={stageFormDispatch}
                editingStage={editingStage}
                clearStageForm={clearStageForm}
                handleStageSubmit={handleStageSubmit}
              />

              {/* Liste des étapes */}
              {stages.length === 0 && <p className="studio-detail--empty">Aucune étape.</p>}
              <div className="studio-stage-list">
                {stages.map((stage, index) => {
                const stagePois = poisByStage[stage.id] ?? [];
                const stageVariants = variantsByStage[stage.id] ?? [];
                const expanded = expandedStages[stage.id] !== false;
                return (
                  <StageCard
                    key={stage.id}
                    stage={stage}
                    index={index}
                    expanded={expanded}
                    onToggleExpand={() => setExpandedStages(prev => ({ ...prev, [stage.id]: !prev[stage.id] }))}
                    stageCrud={stageCrud}
                    gpx={gpx}
                    enrich={enrich}
                    stagePois={stagePois}
                    stageVariants={stageVariants}
                  />
                );
              })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}






