import { useCallback, useEffect, useState } from "react";
import { buildGoogleMapsDirectionsUrl, buildStartPointRecord, createEmptyStartPoint, hasStartPoint, normalizeStartPoint, startPointRoutePayload } from "@/lib/roadbooks/start-point";
import { loadStartPoint } from "@/lib/roadbooks/loaders";
import { saveStartPoint } from "@/lib/roadbooks/writers";
import { enrichResourceBatch } from "@/lib/enrichment";
import { completeAccommodationValue, isMissingAutomationValue } from "@/lib/roadbooks/automation";

export default function useStartPoint({ supabase, roadbookId, user }) {
  const [startPoint, setStartPoint] = useState(createEmptyStartPoint);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !roadbookId) return;
    let active = true;
    setLoading(true);
    loadStartPoint(supabase, roadbookId)
      .then(data => {
        if (!active) return;
        setStartPoint(normalizeStartPoint(data));
      })
      .catch(() => { if (active) setStartPoint(createEmptyStartPoint()); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [supabase, roadbookId, user]);

  const prepareForSave = useCallback(async () => {
    let completed = { ...normalizeStartPoint(startPoint), google_maps_url: buildGoogleMapsDirectionsUrl(startPoint) };
    const warnings = [];
    let fields = 0;
    const needsDistance = String(completed.distance_km).trim() === "";
    const needsDuration = completed.duration.trim() === "";
    if ((needsDistance || needsDuration) && completed.departure_city.trim() && completed.arrival_city.trim()) {
      try {
        const response = await fetch("/api/google-maps/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(startPointRoutePayload(completed, roadbookId)),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Calcul Google Maps indisponible.");
        if (needsDistance && result.distanceKm != null) { completed.distance_km = String(result.distanceKm); fields += 1; }
        if (needsDuration && result.duration) { completed.duration = result.duration; fields += 1; }
      } catch (error) {
        warnings.push(error?.message ?? String(error));
      }
    }
    const enrichmentItems = [];
    completed.accommodations.forEach((item, index) => {
      if (((isMissingAutomationValue(item.photo) && !item.photoMediaId) || isMissingAutomationValue(item.description)) && (item.name || item.url)) {
        enrichmentItems.push({ id: `start:accommodation:${index}`, kind: "accommodation", name: item.name, region: completed.arrival_city, url: item.url });
      }
    });
    completed.pois.forEach((item, index) => {
      if (((isMissingAutomationValue(item.photo_url) && !item.photoMediaId) || isMissingAutomationValue(item.description)) && (item.name || item.link_url)) {
        enrichmentItems.push({ id: `start:poi:${index}`, kind: "poi", name: item.name, region: item.region || completed.arrival_city, url: item.link_url });
      }
    });
    const enrichment = await enrichResourceBatch(enrichmentItems);
    completed.accommodations = completed.accommodations.map((item, index) => {
      const found = enrichment.get(`start:accommodation:${index}`);
      if (!found) return item;
      const completion = completeAccommodationValue(item, found);
      fields += completion.filled;
      return completion.value;
    });
    completed.pois = completed.pois.map((item, index) => {
      const found = enrichment.get(`start:poi:${index}`);
      if (!found) return item;
      const next = { ...item };
      if (isMissingAutomationValue(next.photo_url) && !next.photoMediaId && found.image) { next.photo_url = found.image; fields += 1; }
      if (isMissingAutomationValue(next.description) && found.description) { next.description = found.description; fields += 1; }
      if (!next.preview && found.preview) next.preview = found.preview;
      return next;
    });
    return { value: completed, report: { fields, warnings } };
  }, [startPoint, roadbookId]);

  const persist = useCallback(async (value) => {
    await saveStartPoint(supabase, roadbookId, buildStartPointRecord(value, roadbookId), hasStartPoint(value));
  }, [supabase, roadbookId]);

  return { startPoint, setStartPoint, startPointLoading: loading, prepareStartPointForSave: prepareForSave, persistStartPoint: persist };
}
