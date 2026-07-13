import { normalizeNumber } from "./validators.js";

export function buildOfficialMeta({ officialDist, officialGain, officialLoss, officialGpx, officialMap }) {
  return {
    distance: normalizeNumber(officialDist),
    elevationGain: normalizeNumber(officialGain),
    elevationLoss: normalizeNumber(officialLoss),
    gpx: officialGpx || null,
    mapEmbedUrl: officialMap || null,
  };
}

export function buildStagesTotalMeta({ traceDist, traceGain, traceLoss, traceGpx, traceMap }) {
  return {
    distance: normalizeNumber(traceDist),
    elevationGain: normalizeNumber(traceGain),
    elevationLoss: normalizeNumber(traceLoss),
    gpx: traceGpx || null,
    mapEmbedUrl: traceMap || null,
  };
}

export function buildTraceUpdateFields({ traceDist, traceGain, traceLoss }) {
  return {
    distance_km: normalizeNumber(traceDist),
    elevation_gain_m: normalizeNumber(traceGain),
    elevation_loss_m: normalizeNumber(traceLoss),
  };
}

export function calculateTotals(stages) {
  let totalDist = 0, totalGain = 0, totalLoss = 0;
  let hasDist = false, hasGain = false, hasLoss = false;
  (stages || []).forEach(s => {
    if (s.distance_km != null) { totalDist += Number(s.distance_km); hasDist = true; }
    if (s.elevation_gain_m != null) { totalGain += Number(s.elevation_gain_m); hasGain = true; }
    if (s.elevation_loss_m != null) { totalLoss += Number(s.elevation_loss_m); hasLoss = true; }
  });
  return {
    totalDist: hasDist ? Math.round(totalDist * 100) / 100 : null,
    totalGain: hasGain ? Math.round(totalGain) : null,
    totalLoss: hasLoss ? Math.round(totalLoss) : null,
    hasDist, hasGain, hasLoss,
  };
}

export function formatTotalsSummary(stages, totals) {
  const parts = [`${stages.length} étape(s)`];
  if (totals.hasDist) parts.push(`distance totale : ${totals.totalDist.toFixed(1)} km`);
  else parts.push("distance : aucune donnée");
  if (totals.hasGain) parts.push(`D+ total : ${totals.totalGain} m`);
  if (totals.hasLoss) parts.push(`D− total : ${totals.totalLoss} m`);
  return parts;
}

export function buildTotalsUpdateFields(totals) {
  const fields = {};
  if (totals.hasDist) fields.distance_km = totals.totalDist;
  if (totals.hasGain) fields.elevation_gain_m = totals.totalGain;
  if (totals.hasLoss) fields.elevation_loss_m = totals.totalLoss;
  return fields;
}

export function buildGpxStageUpdate(metrics, durationStr) {
  const update = {};
  if (metrics.distanceKm > 0) update.distance_km = Math.round(metrics.distanceKm * 100) / 100;
  if (metrics.elevationGainM != null) update.elevation_gain_m = Math.round(metrics.elevationGainM);
  if (metrics.elevationLossM != null) update.elevation_loss_m = Math.round(metrics.elevationLossM);
  if (durationStr) update.duration = durationStr;
  return update;
}

export function buildEnrichPoiUpdate(found) {
  const update = {};
  if (found.description) update.description = found.description;
  if (found.coordinates) { update.lat = found.coordinates.lat; update.lng = found.coordinates.lng; }
  if (found.image) update.photo_url = found.image;
  if (found.url) update.link_url = found.url;
  return update;
}

export function buildEnrichAccommodationUpdate(found) {
  const update = {};
  if (found.name) update.accommodation_name = found.name;
  if (found.image) update.accommodation_photo = found.image;
  return update;
}

export function buildExistingFieldsList(stage) {
  const parts = [];
  if (stage.distance_km != null) parts.push(`distance (${stage.distance_km} km)`);
  if (stage.elevation_gain_m != null) parts.push(`D+ (${stage.elevation_gain_m} m)`);
  if (stage.elevation_loss_m != null) parts.push(`D− (${stage.elevation_loss_m} m)`);
  if (stage.duration) parts.push(`durée (${stage.duration})`);
  return parts;
}

export function buildGpxConfirmMessage(stage, metrics, durationStr) {
  const existing = buildExistingFieldsList(stage);
  const newVals = [
    `• Distance : ${metrics.distanceKm.toFixed(1)} km`,
    metrics.elevationGainM != null ? `• D+ : ${Math.round(metrics.elevationGainM)} m` : null,
    metrics.elevationLossM != null ? `• D− : ${Math.round(metrics.elevationLossM)} m` : null,
    durationStr ? `• Durée : ${durationStr}` : null,
  ].filter(Boolean).join("\n");

  if (existing.length) {
    return `Cette étape a déjà des valeurs de ${existing.join(", ")}.\n\nNouvelles valeurs calculées :\n${newVals}\n\nÉcraser les valeurs existantes ?`;
  }
  return `Aucune valeur existante.\n\nValeurs calculées :\n${newVals}\n\nAppliquer ?`;
}

export function buildGpxMetricsSuccessMessage(metrics, durationStr) {
  let msg = `${metrics.distanceKm.toFixed(1)} km`;
  if (metrics.elevationGainM != null) msg += `, D+ ${Math.round(metrics.elevationGainM)} m`;
  if (metrics.elevationLossM != null) msg += `, D− ${Math.round(metrics.elevationLossM)} m`;
  if (durationStr) msg += `, ${durationStr}`;
  return msg;
}

export function buildDuplicateSlug(originalSlug) {
  return `${originalSlug}-copie-${Date.now()}`;
}

export function buildDuplicateRoadbookInsert(roadbook, slug, userId) {
  return {
    slug,
    owner_id: userId,
    title: `${roadbook.title} (copie)`,
    description: roadbook.description,
    is_public: false,
  };
}

export function buildDuplicateStageInsert(stage, newRoadbookId) {
  return {
    roadbook_id: newRoadbookId,
    stage_number: stage.stage_number,
    title: stage.title,
    departure: stage.departure,
    arrival: stage.arrival,
    distance_km: stage.distance_km,
    elevation_gain_m: stage.elevation_gain_m,
    elevation_loss_m: stage.elevation_loss_m,
    gpx_url: null,
    map_embed_url: stage.map_embed_url,
    stage_photo_url: null,
    day: stage.day,
    stage_label: stage.stage_label,
    duration: stage.duration,
    accommodation_name: stage.accommodation_name,
    accommodation_url: stage.accommodation_url,
    accommodation_photo: null,
    accommodation_type: stage.accommodation_type,
    notes: stage.notes,
    alternatives: stage.alternatives,
    is_substep: stage.is_substep,
    parent_stage_number: stage.parent_stage_number,
    metadata: stage.metadata,
  };
}

export function buildDuplicatePoiInsert(poi, newStageId) {
  return {
    stage_id: newStageId,
    name: poi.name,
    lat: poi.lat,
    lng: poi.lng,
    poi_type: poi.poi_type,
    description: poi.description,
    photo_url: null,
    link_url: poi.link_url,
    region: poi.region,
    sort_order: poi.sort_order,
    metadata: poi.metadata,
  };
}

export function buildDuplicateVariantInsert(v, newStageId) {
  return {
    stage_id: newStageId,
    label: v.label,
    distance_km: v.distance_km,
    gpx_url: null,
    description: v.description,
    sort_order: v.sort_order,
    departure: v.departure ?? v.metadata?.departure ?? null,
    arrival: v.arrival ?? v.metadata?.arrival ?? null,
    elevation_gain_m: v.elevation_gain_m ?? v.metadata?.elevation_gain_m ?? null,
    elevation_loss_m: v.elevation_loss_m ?? v.metadata?.elevation_loss_m ?? null,
    map_embed_url: v.map_embed_url ?? v.metadata?.map_embed_url ?? null,
    notes: v.notes ?? v.metadata?.notes ?? [],
    metadata: v.metadata,
  };
}
