import { useCallback, useState } from "react";
import { createPoiIndex, createAccommodationIndex, findPoi, findAccommodation, findAccommodationByName, loadEnrichmentData } from "@/lib/enrichment";
import { applyPoiEnrichment, applyAccommodationEnrichment } from "@/lib/roadbooks/enrich";
import { loadPois, loadStages } from "@/lib/roadbooks/loaders";
import { conditionalUpdateRoadbook } from "@/lib/sync-helpers";

export function useEnrichment({ supabase, roadbook, setRoadbook, stages, setStages, setPoisByStage, onError, onSuccess, reloadPoisVariants, reloadStages }) {
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
  };
}
