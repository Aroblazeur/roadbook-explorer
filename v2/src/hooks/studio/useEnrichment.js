import { useCallback, useState } from "react";
import {
  createPoiIndex,
  createAccommodationIndex,
  findPoi,
  findAccommodation,
  findAccommodationByName,
  loadEnrichmentData,
} from "@/lib/enrichment";
import {
  completeAccommodation,
  completePoi,
  completeStageMetrics,
  isMissingAutomationValue,
} from "@/lib/roadbooks/automation";

export function useEnrichment({ roadbook, stages, poisByStage, gpxHelpers }) {
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
    const completedPois = Object.fromEntries(
      Object.entries(poisByStage).map(([stageId, pois]) => [stageId, pois.map(poi => ({ ...poi }))]),
    );
    const report = { gpxStages: 0, pois: 0, accommodations: 0, fields: 0, warnings: [] };
    const poiUpdates = [];

    let activePoiIndex = poiIndex;
    let activeAccommodationIndex = accommodationIndex;
    if ((!activePoiIndex || !activeAccommodationIndex) && roadbook?.slug) {
      const loaded = await loadEnrichmentIndices();
      activePoiIndex ??= loaded.poi;
      activeAccommodationIndex ??= loaded.accommodation;
    }

    const { gpxByStage, analyzeStageGpx } = gpxHelpers ?? {};
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

    if (activeAccommodationIndex) {
      for (const stage of completedStages) {
        if (!isMissingAutomationValue(stage.accommodation_name) && !isMissingAutomationValue(stage.accommodation_photo)) continue;
        let found = stage.accommodation_url
          ? findAccommodation(stage.accommodation_url, activeAccommodationIndex)
          : null;
        if (!found && stage.accommodation_name) {
          found = findAccommodationByName(stage.accommodation_name, activeAccommodationIndex);
        }
        if (!found) continue;
        const completion = completeAccommodation(stage, found);
        Object.assign(stage, completion.value);
        const { filled } = completion;
        if (filled) { report.accommodations++; report.fields += filled; }
      }
    }

    if (activePoiIndex) {
      for (const pois of Object.values(completedPois)) {
        for (const poi of pois) {
          const found = findPoi(poi.name, activePoiIndex);
          if (!found) continue;
          const completion = completePoi(poi, found);
          Object.assign(poi, completion.value);
          const { filled } = completion;
          if (filled) {
            poiUpdates.push({
              id: poi.id,
              updates: { description: poi.description || null, photo_url: poi.photo_url || null, link_url: poi.link_url || null },
            });
            report.pois++;
            report.fields += filled;
          }
        }
      }
    }

    return { stages: completedStages, poisByStage: completedPois, poiUpdates, report };
  }, [stages, poisByStage, poiIndex, accommodationIndex, roadbook?.slug, loadEnrichmentIndices, gpxHelpers]);

  return { loadEnrichmentIndices, prepareAutomaticCompletion };
}
