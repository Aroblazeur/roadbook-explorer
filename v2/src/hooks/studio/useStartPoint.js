import { useCallback, useEffect, useState } from "react";
import { buildStartPointRecord, createEmptyStartPoint, hasStartPoint, normalizeJourney, normalizeStartPoint, startPointRoutePayload } from "@/lib/roadbooks/start-point";
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
      .then(data => { if (active) setStartPoint(normalizeStartPoint(data)); })
      .catch(() => { if (active) setStartPoint(createEmptyStartPoint()); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [supabase, roadbookId, user?.id]);

  const setReturnPoint = useCallback(updater => {
    setStartPoint(previous => {
      const normalized = normalizeStartPoint(previous);
      const nextReturn = typeof updater === "function" ? updater(normalized.return_trip) : updater;
      return { ...normalized, return_trip: normalizeJourney(nextReturn) };
    });
  }, []);

  const prepareForSave = useCallback(async () => {
    const point = normalizeStartPoint(startPoint);
    const warnings = [];
    let fields = 0;

    const completeJourney = async (input, scope) => {
      const completed = normalizeJourney(input);
      completed.transport_segments = await Promise.all(completed.transport_segments.map(async (segment, index) => {
        const next = { ...segment };
        const needsDistance = String(next.distance_km).trim() === "";
        const needsDuration = next.duration.trim() === "";
        if ((needsDistance || needsDuration) && next.departure_city.trim() && next.arrival_city.trim()) {
          try {
            const response = await fetch("/api/google-maps/route", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(startPointRoutePayload(next, roadbookId)),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Calcul Google Maps indisponible.");
            if (needsDistance && result.distanceKm != null) { next.distance_km = String(result.distanceKm); fields += 1; }
            if (needsDuration && result.duration) { next.duration = result.duration; fields += 1; }
          } catch (error) {
            warnings.push(`${scope === "return" ? "Retour" : "Point de départ"}, trajet ${index + 1} : ${error?.message ?? String(error)}`);
          }
        }
        return next;
      }));

      const contextCity = completed.transport_segments.at(-1)?.arrival_city || completed.transport_segments[0]?.departure_city || "";
      const enrichmentItems = [];
      completed.accommodations.forEach((item, index) => {
        if (((isMissingAutomationValue(item.photo) && !item.photoMediaId) || isMissingAutomationValue(item.description)) && (item.name || item.url)) {
          enrichmentItems.push({ id: `${scope}:accommodation:${index}`, kind: "accommodation", name: item.name, region: contextCity, url: item.url });
        }
      });
      completed.pois.forEach((item, index) => {
        if (((isMissingAutomationValue(item.photo_url) && !item.photoMediaId) || isMissingAutomationValue(item.description)) && (item.name || item.link_url)) {
          enrichmentItems.push({ id: `${scope}:poi:${index}`, kind: "poi", name: item.name, region: item.region || contextCity, url: item.link_url });
        }
      });
      const enrichment = await enrichResourceBatch(enrichmentItems);
      completed.accommodations = completed.accommodations.map((item, index) => {
        const found = enrichment.get(`${scope}:accommodation:${index}`);
        if (!found) return item;
        const completion = completeAccommodationValue(item, found);
        fields += completion.filled;
        return completion.value;
      });
      completed.pois = completed.pois.map((item, index) => {
        const found = enrichment.get(`${scope}:poi:${index}`);
        if (!found) return item;
        const next = { ...item };
        if (isMissingAutomationValue(next.photo_url) && !next.photoMediaId && found.image) { next.photo_url = found.image; fields += 1; }
        if (isMissingAutomationValue(next.description) && found.description) { next.description = found.description; fields += 1; }
        if (!next.preview && found.preview) next.preview = found.preview;
        return next;
      });
      return completed;
    };

    const completedStart = await completeJourney(point, "start");
    const completedReturn = await completeJourney(point.return_trip, "return");
    return { value: { ...completedStart, return_trip: completedReturn }, report: { fields, warnings } };
  }, [startPoint, roadbookId]);

  const persist = useCallback(async value => {
    await saveStartPoint(supabase, roadbookId, buildStartPointRecord(value, roadbookId), hasStartPoint(value));
  }, [supabase, roadbookId]);

  return {
    startPoint,
    setStartPoint,
    returnPoint: normalizeStartPoint(startPoint).return_trip,
    setReturnPoint,
    startPointLoading: loading,
    prepareStartPointForSave: prepareForSave,
    persistStartPoint: persist,
  };
}
