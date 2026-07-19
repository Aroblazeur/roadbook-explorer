import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { elevationMetricsFromSamples } from "@/lib/elevation-metrics";
import { resolveGoogleMapsRoute } from "@/lib/google-map-links";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const ELEVATION_API_URL = "https://maps.googleapis.com/maps/api/elevation/json";
const ALLOWED_TRAVEL_MODES = new Set(["BICYCLE", "WALK", "DRIVE", "TWO_WHEELER"]);

function cleanLocation(value) {
  return typeof value === "string" ? value.trim().slice(0, 300) : "";
}

function formatDuration(value) {
  const seconds = Math.max(0, Number.parseFloat(String(value ?? "").replace(/s$/, "")) || 0);
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return `${remaining} min`;
  return remaining ? `${hours} h ${String(remaining).padStart(2, "0")}` : `${hours} h`;
}

async function computeRoute(apiKey, locations, travelMode) {
  const response = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { address: locations[0] },
      destination: { address: locations.at(-1) },
      intermediates: locations.slice(1, -1).slice(0, 9).map(address => ({ address })),
      travelMode,
      languageCode: "fr-FR",
      units: "METRIC",
      polylineQuality: "OVERVIEW",
      polylineEncoding: "ENCODED_POLYLINE",
    }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "Google Maps n'a pas pu calculer cet itinéraire.");
  const route = result.routes?.[0];
  if (!route?.polyline?.encodedPolyline) throw new Error("L'itinéraire Google Maps ne contient pas de tracé exploitable.");
  return route;
}

async function computeElevation(apiKey, encodedPolyline, distanceMeters) {
  const samples = Math.min(512, Math.max(64, Math.ceil(distanceMeters / 200)));
  const url = new URL(ELEVATION_API_URL);
  url.searchParams.set("path", `enc:${encodedPolyline}`);
  url.searchParams.set("samples", String(samples));
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || result.status !== "OK") {
    throw new Error(result?.error_message || `Elevation API : ${result?.status || response.status}`);
  }
  return elevationMetricsFromSamples(result.results);
}

export async function POST(request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

    const body = await request.json();
    const roadbookId = Number(body.roadbookId);
    if (!Number.isInteger(roadbookId) || roadbookId <= 0) {
      return NextResponse.json({ error: "Roadbook invalide." }, { status: 400 });
    }

    const { data: roadbook } = await supabase.from("roadbooks").select("id, owner_id").eq("id", roadbookId).maybeSingle();
    if (!roadbook) return NextResponse.json({ error: "Roadbook inaccessible." }, { status: 404 });
    let canEdit = roadbook.owner_id === user.id || user.app_metadata?.role === "admin";
    if (!canEdit) {
      const { data: contribution } = await supabase.from("roadbook_contributors").select("user_id").eq("roadbook_id", roadbookId).eq("user_id", user.id).maybeSingle();
      canEdit = Boolean(contribution);
    }
    if (!canEdit) return NextResponse.json({ error: "Vous ne pouvez pas modifier ce roadbook." }, { status: 403 });

    const mapRoute = body.mapUrl ? await resolveGoogleMapsRoute(body.mapUrl) : null;
    const fallbackLocations = [cleanLocation(body.origin), cleanLocation(body.destination)].filter(Boolean);
    const locations = mapRoute?.locations?.length >= 2 ? mapRoute.locations : fallbackLocations;
    if (locations.length < 2) {
      return NextResponse.json({ error: "Ajoutez un itinéraire Google Maps ou renseignez les villes de départ et d'arrivée." }, { status: 400 });
    }

    const requestedMode = String(mapRoute?.travelMode || body.fallbackTravelMode || "BICYCLE").toUpperCase();
    const travelMode = ALLOWED_TRAVEL_MODES.has(requestedMode) ? requestedMode : "BICYCLE";
    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "La clé Google Maps n'est pas configurée." }, { status: 503 });
    if (!apiKey.startsWith("AIza") || apiKey.length < 30) {
      return NextResponse.json({
        error: "GOOGLE_MAPS_API_KEY ne contient pas une clé Google Maps valide. Remplacez sa valeur dans Vercel par la clé API complète, puis redéployez.",
      }, { status: 503 });
    }

    const route = await computeRoute(apiKey, locations, travelMode);
    const distanceMeters = Number(route.distanceMeters) || 0;
    let elevation = { elevationGainM: null, elevationLossM: null };
    let warning = null;
    try {
      elevation = await computeElevation(apiKey, route.polyline.encodedPolyline, distanceMeters);
    } catch (elevationError) {
      warning = `Distance calculée, mais dénivelé indisponible : ${elevationError.message}`;
    }

    return NextResponse.json({
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      duration: formatDuration(route.duration),
      elevationGainM: elevation.elevationGainM,
      elevationLossM: elevation.elevationLossM,
      travelMode,
      locations,
      warning,
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message ?? "Calcul Google Maps impossible." }, { status: 502 });
  }
}
