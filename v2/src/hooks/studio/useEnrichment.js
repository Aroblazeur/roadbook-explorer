import { useCallback, useState } from "react";
import {
  createPoiIndex,
  createAccommodationIndex,
  findPoi,
  findAccommodation,
  findAccommodationByName,
  loadEnrichmentData,
  enrichResourceBatch,
} from "@/lib/enrichment";
import {
  completeAccommodation,
  completeAccommodationValue,
  completePoi,
  completeStageDuration,
  completeStageMetrics,
  isMissingAutomationValue,
} from "@/lib/roadbooks/automation";
import { alternativesFromStage, primaryAccommodationFromStage } from "@/lib/roadbooks/accommodations";

export function useEnrichment({ roadbook, activity, stages, variantsByStage, poisByStage, poisByVariant = {}, gpxHelpers, analyzeGoogleMapsRoute }) {
  const [poiIndex, setPoiIndex] = useState(null);
  const [accommodationIndex, setAccommodationIndex] = useState(null);

  const loadEnrichmentIndices = useCallback(async () => {
    if (!roadbook?.slug) return { poi: null, accommodation: null };
    const [poiData, accommodationData] = await Promise.all([
      loadEnrichmentData(roadbook.slug, "poi"),
      loadEnrichmentData(roadbook.slug, "accommodation"),
    ]);
    const nextPoiIndex = poiData?.items ? createPoiIndex(poiData.items) : null;
    const nextAccommodationIndex = accommodationData?.items
      ? createAccommodationIndex(accommodationData.items)
      : null;
    setPoiIndex(nextPoiIndex);
    setAccommodationIndex(nextAccommodationIndex);
    return { poi: nextPoiIndex, accommodation: nextAccommodationIndex };
  }, [roadbook?.slug]);

  const prepareAutomaticCompletion = useCallback(async () => {
    const completedStages = stages.map(stage => ({ ...stage, metadata: { ...(stage.metadata ?? {}) } }));
    const completedVariantsByStage = Object.fromEntries(
      Object.entries(variantsByStage ?? {}).map(([stageId, variants]) => [
        stageId,
        variants.map(variant => ({ ...variant, metadata: { ...(variant.metadata ?? {}) } })),
      ]),
    );
    const completedPois = Object.fromEntries(
      Object.entries(poisByStage).map(([stageId, pois]) => [stageId, pois.map(poi => ({ ...poi }))]),
    );
    const completedVariantPois = Object.fromEntries(
      Object.entries(poisByVariant).map(([variantId, pois]) => [variantId, pois.map(poi => ({ ...poi }))]),
    );
    const report = { gpxStages: 0, gpxVariants: 0, pois: 0, accommodations: 0, fields: 0, warnings: [] };
    const poiUpdates = new Map();
    const stageById = new Map(completedStages.map(stage => [String(stage.id), stage]));
    const variantById = new Map(Object.values(completedVariantsByStage).flat().map(variant => [String(variant.id), variant]));
    const locationsForEntity = entity => [entity?.arrival, entity?.departure].map(value => String(value ?? "").trim()).filter(Boolean);
    const locationsForPoi = poi => {
      const entity = poi?.variant_id != null ? variantById.get(String(poi.variant_id)) : stageById.get(String(poi?.stage_id));
      return locationsForEntity(entity);
    };
    const safeEnrichmentResult = result => result?.confidence === "high"
      ? result
      : result?.preview ? { preview: result.preview } : null;

    let activePoiIndex = poiIndex;
    let activeAccommodationIndex = accommodationIndex;
    if ((!activePoiIndex || !activeAccommodationIndex) && roadbook?.slug) {
      const loaded = await loadEnrichmentIndices();
      activePoiIndex ??= loaded.poi;
      activeAccommodationIndex ??= loaded.accommodation;
    }

    const { gpxByStage, gpxByVariant, analyzeStageGpx } = gpxHelpers ?? {};
    if (gpxByStage && analyzeStageGpx) {
      for (const stage of completedStages) {
        const gpx = gpxByStage[stage.id];
        const missingMetrics = [stage.distance_km, stage.elevation_gain_m, stage.elevation_loss_m, stage.duration]
          .some(isMissingAutomationValue);
        if (!gpx || !missingMetrics) continue;
        const result = await analyzeStageGpx(gpx, stage);
        if (!result || result.error) {
          report.warnings.push(`Jour ${stage.stage_number} : ${result?.error ?? "analyse GPX impossible"}`);
          continue;
        }
        const completion = completeStageMetrics(stage, result.metrics, result.durationStr);
        Object.assign(stage, completion.value);
        const { filled } = completion;
        if (filled) { report.gpxStages++; report.fields += filled; }
      }
    }

    if (gpxByVariant && analyzeStageGpx) {
      for (const [stageId, variants] of Object.entries(completedVariantsByStage)) {
        for (const variant of variants) {
          const gpx = gpxByVariant[stageId]?.[variant.id];
          const missingMetrics = [variant.distance_km, variant.elevation_gain_m, variant.elevation_loss_m, variant.duration]
            .some(isMissingAutomationValue);
          if (!gpx || !missingMetrics) continue;
          const result = await analyzeStageGpx(gpx, variant);
          if (!result || result.error) {
            report.warnings.push(`Variante ${variant.label || variant.id} : ${result?.error ?? "analyse GPX impossible"}`);
            continue;
          }
          const completion = completeStageMetrics(variant, result.metrics, result.durationStr);
          Object.assign(variant, completion.value);
          if (completion.filled) { report.gpxVariants++; report.fields += completion.filled; }
        }
      }
    }

    if (analyzeGoogleMapsRoute) {
      for (const entity of [...completedStages, ...Object.values(completedVariantsByStage).flat()]) {
        const missingMetrics = [entity.distance_km, entity.elevation_gain_m, entity.elevation_loss_m]
          .some(isMissingAutomationValue);
        if (!entity.map_embed_url || !missingMetrics) continue;
        try {
          const result = await analyzeGoogleMapsRoute(entity);
          const completion = completeStageMetrics(entity, result.metrics, result.duration);
          Object.assign(entity, completion.value);
          if (completion.filled) report.fields += completion.filled;
          if (result.warning) report.warnings.push(`${entity.label || entity.title || "Itinéraire"} : ${result.warning}`);
        } catch (error) {
          report.warnings.push(`${entity.label || entity.title || "Itinéraire"} : ${error?.message ?? String(error)}`);
        }
      }
    }

    for (const stage of completedStages) {
      const completion = completeStageDuration(stage, activity);
      Object.assign(stage, completion.value);
      report.fields += completion.filled;
    }
    for (const variants of Object.values(completedVariantsByStage)) {
      for (const variant of variants) {
        const completion = completeStageDuration(variant, activity);
        Object.assign(variant, completion.value);
        report.fields += completion.filled;
      }
    }

    if (activeAccommodationIndex) {
      for (const entity of [...completedStages, ...Object.values(completedVariantsByStage).flat()]) {
        const primary = primaryAccommodationFromStage(entity);
        const entityLocations = locationsForEntity(entity);
        let found = primary.url ? findAccommodation(primary.url, activeAccommodationIndex, entityLocations) : null;
        if (!found && primary.name) found = findAccommodationByName(primary.name, activeAccommodationIndex, entityLocations);
        if (found) {
          const completion = completeAccommodation(entity, found);
          Object.assign(entity, completion.value);
          if (completion.filled) { report.accommodations++; report.fields += completion.filled; }
        }
        const alternatives = alternativesFromStage(entity).map(item => {
          const alternativeFound = (item.url ? findAccommodation(item.url, activeAccommodationIndex, entityLocations) : null) || findAccommodationByName(item.name, activeAccommodationIndex, entityLocations);
          if (!alternativeFound) return item;
          const completion = completeAccommodationValue(item, alternativeFound);
          if (completion.filled) { report.accommodations++; report.fields += completion.filled; }
          return completion.value;
        });
        if (alternatives.length) entity.alternatives = alternatives;
      }
    }

    if (activePoiIndex) {
      for (const pois of [...Object.values(completedPois), ...Object.values(completedVariantPois)]) {
        for (const poi of pois) {
          const found = findPoi(poi.name, activePoiIndex, [poi.region, ...locationsForPoi(poi)].filter(Boolean));
          if (!found) continue;
          const completion = completePoi(poi, found);
          Object.assign(poi, completion.value);
          const { filled } = completion;
          if (filled) {
            poiUpdates.set(poi.id, {
              id: poi.id,
              updates: { description: poi.description || null, photo_url: poi.photo_url || null, link_url: poi.link_url || null, metadata: poi.metadata ?? {} },
            });
            report.pois++;
            report.fields += filled;
          }
        }
      }
    }

    const remoteItems = [];
    for (const entity of [...completedStages, ...Object.values(completedVariantsByStage).flat()]) {
      const scope = completedStages.includes(entity) ? `stage:${entity.id}` : `variant:${entity.id}`;
      const primary = primaryAccommodationFromStage(entity);
      if ((isMissingAutomationValue(primary.photo) && !primary.photoMediaId) || isMissingAutomationValue(primary.description)) {
        if (primary.name || primary.url) remoteItems.push({ id: `${scope}:primary`, kind: "accommodation", name: primary.name, url: primary.url, locations: locationsForEntity(entity) });
      }
      alternativesFromStage(entity).forEach((item, index) => {
        if (((isMissingAutomationValue(item.photo) && !item.photoMediaId) || isMissingAutomationValue(item.description)) && (item.name || item.url)) {
          remoteItems.push({ id: `${scope}:alternative:${index}`, kind: "accommodation", name: item.name, url: item.url, locations: locationsForEntity(entity) });
        }
      });
    }
    for (const pois of [...Object.values(completedPois), ...Object.values(completedVariantPois)]) {
      for (const poi of pois) {
        if ((isMissingAutomationValue(poi.photo_url) && !poi.metadata?.poiPhotoMediaId) || isMissingAutomationValue(poi.description)) {
          remoteItems.push({ id: `poi:${poi.id}`, kind: "poi", name: poi.name, region: poi.region, url: poi.link_url, locations: locationsForPoi(poi) });
        }
      }
    }

    const remoteResults = await enrichResourceBatch(remoteItems);
    for (const entity of [...completedStages, ...Object.values(completedVariantsByStage).flat()]) {
      const scope = completedStages.includes(entity) ? `stage:${entity.id}` : `variant:${entity.id}`;
      const primaryResult = safeEnrichmentResult(remoteResults.get(`${scope}:primary`));
      if (primaryResult) {
        const completion = completeAccommodation(entity, primaryResult);
        Object.assign(entity, completion.value);
        if (completion.filled) { report.accommodations++; report.fields += completion.filled; }
      }
      const alternatives = alternativesFromStage(entity).map((item, index) => {
        const result = safeEnrichmentResult(remoteResults.get(`${scope}:alternative:${index}`));
        if (!result) return item;
        const completion = completeAccommodationValue(item, result);
        if (completion.filled) { report.accommodations++; report.fields += completion.filled; }
        return completion.value;
      });
      if (alternatives.length) entity.alternatives = alternatives;
    }
    for (const pois of [...Object.values(completedPois), ...Object.values(completedVariantPois)]) {
      for (const poi of pois) {
        const result = safeEnrichmentResult(remoteResults.get(`poi:${poi.id}`));
        if (!result) continue;
        const completion = completePoi(poi, result);
        Object.assign(poi, completion.value);
        if (completion.filled || result.preview) {
          poiUpdates.set(poi.id, { id: poi.id, updates: { description: poi.description || null, photo_url: poi.photo_url || null, link_url: poi.link_url || null, metadata: poi.metadata ?? {} } });
        }
        if (completion.filled) { report.pois++; report.fields += completion.filled; }
      }
    }

    return { stages: completedStages, variantsByStage: completedVariantsByStage, poisByStage: completedPois, poisByVariant: completedVariantPois, poiUpdates: [...poiUpdates.values()], report };
  }, [stages, variantsByStage, poisByStage, poisByVariant, poiIndex, accommodationIndex, roadbook?.slug, activity, loadEnrichmentIndices, gpxHelpers, analyzeGoogleMapsRoute]);

  return { loadEnrichmentIndices, prepareAutomaticCompletion };
}
