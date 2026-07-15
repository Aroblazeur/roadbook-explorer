import { useCallback, useEffect, useState } from "react";
import { buildGoogleMapsDirectionsUrl, buildStartPointRecord, createEmptyStartPoint, hasStartPoint, normalizeStartPoint, startPointRoutePayload } from "@/lib/roadbooks/start-point";
import { loadStartPoint } from "@/lib/roadbooks/loaders";
import { saveStartPoint } from "@/lib/roadbooks/writers";

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
    return { value: completed, report: { fields, warnings } };
  }, [startPoint, roadbookId]);

  const persist = useCallback(async (value) => {
    await saveStartPoint(supabase, roadbookId, buildStartPointRecord(value, roadbookId), hasStartPoint(value));
  }, [supabase, roadbookId]);

  return { startPoint, setStartPoint, startPointLoading: loading, prepareStartPointForSave: prepareForSave, persistStartPoint: persist };
}
