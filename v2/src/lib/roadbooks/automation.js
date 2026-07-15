import { estimateGpxHours, formatDuration } from "../gpx-metrics.js";

export function isMissingAutomationValue(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function completeStageDuration(stage, activity) {
  if (!isMissingAutomationValue(stage?.duration)) return { value: stage, filled: 0 };
  const distance = Number(stage?.distance_km);
  if (!Number.isFinite(distance) || distance <= 0) return { value: stage, filled: 0 };
  const duration = formatDuration(estimateGpxHours(distance, stage?.elevation_gain_m, activity));
  if (!duration) return { value: stage, filled: 0 };
  return { value: { ...stage, duration }, filled: 1 };
}

export function completeStageMetrics(stage, metrics, durationStr) {
  const completed = { ...stage };
  let filled = 0;
  if (isMissingAutomationValue(completed.distance_km) && metrics.distanceKm > 0) { completed.distance_km = Math.round(metrics.distanceKm * 100) / 100; filled++; }
  if (isMissingAutomationValue(completed.elevation_gain_m) && metrics.elevationGainM != null) { completed.elevation_gain_m = Math.round(metrics.elevationGainM); filled++; }
  if (isMissingAutomationValue(completed.elevation_loss_m) && metrics.elevationLossM != null) { completed.elevation_loss_m = Math.round(metrics.elevationLossM); filled++; }
  if (isMissingAutomationValue(completed.duration) && durationStr) { completed.duration = durationStr; filled++; }
  return { value: completed, filled };
}

export function completeAccommodation(stage, found) {
  const completed = { ...stage };
  const metadata = { ...(completed.metadata ?? {}) };
  let filled = 0;
  if (isMissingAutomationValue(completed.accommodation_name) && found?.name) { completed.accommodation_name = found.name; filled++; }
  if (isMissingAutomationValue(completed.accommodation_photo) && !metadata.accommodationPhotoMediaId && found?.image) { completed.accommodation_photo = found.image; filled++; }
  if (isMissingAutomationValue(metadata.accommodationDescription) && found?.description) { metadata.accommodationDescription = found.description; filled++; }
  if (!metadata.accommodationPreview && found?.preview) metadata.accommodationPreview = found.preview;
  if (found?.confidence === "high" && found?.source) metadata.accommodationEnrichment = { source: found.source, confidence: found.confidence };
  completed.metadata = metadata;
  return { value: completed, filled };
}

export function completeAccommodationValue(accommodation, found) {
  const completed = { ...(accommodation ?? {}) };
  let filled = 0;
  if (isMissingAutomationValue(completed.name) && found?.name) { completed.name = found.name; filled++; }
  if (isMissingAutomationValue(completed.photo) && !completed.photoMediaId && found?.image) { completed.photo = found.image; filled++; }
  if (isMissingAutomationValue(completed.description) && found?.description) { completed.description = found.description; filled++; }
  if (!completed.preview && found?.preview) completed.preview = found.preview;
  if (found?.confidence === "high" && found?.source) completed.enrichment = { source: found.source, confidence: found.confidence };
  return { value: completed, filled };
}

export function completePoi(poi, found) {
  const completed = { ...poi };
  let filled = 0;
  if (isMissingAutomationValue(completed.description) && found?.description) { completed.description = found.description; filled++; }
  if (isMissingAutomationValue(completed.photo_url) && found?.image) { completed.photo_url = found.image; filled++; }
  if (isMissingAutomationValue(completed.link_url) && found?.url) { completed.link_url = found.url; filled++; }
  if (!completed.metadata?.linkPreview && found?.preview) {
    completed.metadata = { ...(completed.metadata ?? {}), linkPreview: found.preview };
  }
  if (found?.confidence === "high" && found?.source) {
    completed.metadata = { ...(completed.metadata ?? {}), resourceEnrichment: { source: found.source, confidence: found.confidence } };
  }
  return { value: completed, filled };
}
