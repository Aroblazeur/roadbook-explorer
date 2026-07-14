import { useCallback, useState } from "react";
import { createPoiIndex, createAccommodationIndex, findPoi, findAccommodation, findAccommodationByName, loadEnrichmentData } from "@/lib/enrichment";
import { applyPoiEnrichment, applyAccommodationEnrichment } from "@/lib/roadbooks/enrich";
import { loadPois, loadStages } from "@/lib/roadbooks/loaders";
import { conditionalUpdateRoadbook } from "@/lib/sync-helpers";

export function useEnrichment({
  supabase, roadbook, setRoadbook, stages, setStages, poisByStage, setPoisByStage,
  onError, onSuccess, reloadPoisVariants, reloadStages,
  gpxHelpers,
}) {
  const [poiIndex, setPoiIndex] = useState(null);
  const [accommodationIndex, setAccommodationIndex] = useState(null);
  const [enrichmentError, setEnrichmentError] = useState(null);
  const [enrichingPoi, setEnrichingPoi] = useState(null);
  const [enrichingAccommodation, setEnrichingAccommodation] = useState(null);
  const [automationBusy, setAutomationBusy] = useState(null);
  const [automationResult, setAutomationResult] = useState(null);

  const loadEnrichmentIndices = useCallback(async () => {
    if (!roadbook?.slug) return;
    loadEnrichmentData(roadbook.slug, "poi").then(json => { if (json?.items) setPoiIndex(createPoiIndex(json.items)); }).catch(() => {});
    loadEnrichmentData(roadbook.slug, "accommodation").then(json => { if (json?.items) setAccommodationIndex(createAccommodationIndex(json.items)); }).catch(() => {});
  }, [roadbook?.slug]);

  const enrichPoi = useCallback(async (poi) => {
    if (!poi || !poiIndex) {
      setEnrichmentError("Aucune donnée d'enrichissement disponible pour ce roadbook.");
      return;
    }
    const found = findPoi(poi.name, poiIndex);
    if (!found) {
      setEnrichmentError(`Aucun enrichissement trouvé pour "${poi.name}".`);
      return;
    }
    setEnrichingPoi(poi.id);
    setEnrichmentError(null);
    try {
      const existingDesc = poi.description != null && poi.description !== "";
      const existingLat = poi.lat != null;
      const existingLng = poi.lng != null;
      const existingLink = poi.link_url != null && poi.link_url !== "";
      const anyExisting = existingDesc || existingLat || existingLng || existingLink;
      if (anyExisting) {
        const parts = [];
        if (existingDesc) parts.push("description");
        if (existingLat) parts.push("coordonnées");
        if (existingLink) parts.push("lien");
        const ok = window.confirm(
          `Ce POI a déjà des valeurs (${parts.join(", ")}).\n\n`
          + `Nouvelles valeurs proposées :\n`
          + `• Description : ${found.description || "N/A"}\n`
          + `• Coordonnées : ${found.coordinates ? `${found.coordinates.lat}, ${found.coordinates.lng}` : "N/A"}\n`
          + `• Image : ${found.image || "N/A"}\n`
          + `• Lien : ${found.url || "N/A"}\n\n`
          + `Écraser les valeurs existantes ?`
        );
        if (!ok) { setEnrichingPoi(null); return; }
      }
      const result = await applyPoiEnrichment(supabase, poi.id, found);
      if (!result.updated) { setEnrichmentError("Aucune donnée à mettre à jour."); return; }
      onSuccess?.(`POI "${poi.name}" enrichi.`);
      const stageIds = stages.map(s => s.id);
      if (stageIds.length) {
        const pois = await loadPois(supabase, stageIds);
        const m = {}; pois.forEach(p => { if (!m[p.stage_id]) m[p.stage_id] = []; m[p.stage_id].push(p); });
        if (reloadPoisVariants) {
          const allStageIds = stages.map(s => s.id);
          await reloadPoisVariants(allStageIds);
        }
      }
    } catch (err) { setEnrichmentError(err.message ?? String(err)); }
    finally { setEnrichingPoi(null); }
  }, [supabase, poiIndex, stages, onError, onSuccess, reloadPoisVariants]);

  const enrichAccommodation = useCallback(async (stage) => {
    if (!accommodationIndex) {
      setEnrichmentError("Aucune donnée d'enrichissement disponible pour ce roadbook.");
      return;
    }
    const url = stage.accommodation_url;
    const name = stage.accommodation_name;
    let found = url ? findAccommodation(url, accommodationIndex) : null;
    if (!found && name) {
      found = findAccommodationByName(name, accommodationIndex);
    }
    if (!found) {
      setEnrichmentError(`Aucun enrichissement trouvé pour l'hébergement${url ? ` (${url})` : ""}${name ? ` "${name}"` : ""}.`);
      return;
    }
    setEnrichingAccommodation(stage.id);
    setEnrichmentError(null);
    try {
      const existingName = stage.accommodation_name != null && stage.accommodation_name !== "";
      const existingPhoto = stage.accommodation_photo != null && stage.accommodation_photo !== "";
      const anyExisting = existingName || existingPhoto;
      if (anyExisting) {
        const parts = [];
        if (existingName) parts.push("nom");
        if (existingPhoto) parts.push("photo");
        const ok = window.confirm(
          `Cet hébergement a déjà des valeurs (${parts.join(", ")}).\n\n`
          + `Nouvelles valeurs proposées :\n`
          + `• Nom : ${found.name || "N/A"}\n`
          + `• Image : ${found.image || "N/A"}\n\n`
          + `Écraser les valeurs existantes ?`
        );
        if (!ok) { setEnrichingAccommodation(null); return; }
      }
      const result = await applyAccommodationEnrichment(supabase, stage.id, found);
      if (!result.updated) { setEnrichmentError("Aucune donnée à mettre à jour."); return; }
      onSuccess?.(`Hébergement enrichi : ${found.name || "nom mis à jour"}.`);
      if (reloadStages) await reloadStages();
    } catch (err) { setEnrichmentError(err.message ?? String(err)); }
    finally { setEnrichingAccommodation(null); }
  }, [supabase, accommodationIndex, onError, onSuccess, reloadStages]);

  const recalculateTotals = useCallback(async (updateFields) => {
    try {
      const result = await conditionalUpdateRoadbook(supabase, roadbook?.id ?? stages[0]?.roadbook_id, updateFields, roadbook?.updated_at);
      if (!result.ok) {
        const errMsg = result.error === "conflict" ? "Conflit de version. Rechargez et réessayez." : result.error;
        return { ok: false, msg: `Erreur : ${errMsg}` };
      }
      const summaryParts = [`${stages.length} étape(s)`];
      if (updateFields.distance_km != null) summaryParts.push(`distance totale : ${updateFields.distance_km} km`);
      if (updateFields.elevation_gain_m != null) summaryParts.push(`D+ total : ${updateFields.elevation_gain_m} m`);
      if (updateFields.elevation_loss_m != null) summaryParts.push(`D− total : ${updateFields.elevation_loss_m} m`);
      if (setRoadbook) setRoadbook(prev => ({ ...prev, ...updateFields, updated_at: result.data.updated_at }));
      return { ok: true, msg: `Totaux appliqués : ${summaryParts.join(", ")}.` };
    } catch (err) {
      return { ok: false, msg: `Erreur : ${err.message}` };
    }
  }, [supabase, roadbook, stages, setRoadbook]);

  const handleRecalculateTotals = useCallback(async () => {
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
  }, [stages, recalculateTotals]);

  const handleAnalyzeStageGpx = useCallback(async () => {
    const { gpxByStage, analyzeStageGpx, applyStageMetrics } = gpxHelpers || {};
    if (!gpxByStage || !analyzeStageGpx || !applyStageMetrics) {
      setAutomationResult("Modules GPX non disponibles.");
      return;
    }
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
  }, [stages, gpxHelpers]);

  const handleAutoEnrich = useCallback(async () => {
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
  }, [supabase, poiIndex, accommodationIndex, poisByStage, stages, reloadAfterEnrichment]);

  const reloadAfterEnrichment = useCallback(async () => {
    const stageIds = stages.map(s => s.id);
    if (!stageIds.length) return;
    try {
      const pois = await loadPois(supabase, stageIds);
      const m = {}; pois.forEach(p => { if (!m[p.stage_id]) m[p.stage_id] = []; m[p.stage_id].push(p); });
      if (setPoisByStage) setPoisByStage(m);
      const refreshed = await loadStages(supabase, roadbook?.id ?? stages[0]?.roadbook_id);
      if (refreshed && setStages) setStages(refreshed);
    } catch {}
  }, [supabase, roadbook, stages, setStages, setPoisByStage]);

  return {
    poiIndex, setPoiIndex,
    accommodationIndex, setAccommodationIndex,
    enrichmentError, setEnrichmentError,
    enrichingPoi, enrichingAccommodation,
    automationBusy, setAutomationBusy,
    automationResult, setAutomationResult,
    loadEnrichmentIndices,
    enrichPoi,
    enrichAccommodation,
    recalculateTotals,
    reloadAfterEnrichment,
    handleRecalculateTotals,
    handleAnalyzeStageGpx,
    handleAutoEnrich,
    setPoisByStage,
  };
}
